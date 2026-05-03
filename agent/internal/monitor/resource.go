package monitor

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/mem"

	"github.com/lockon/voight-agent/internal/config"
)

// ResourceSnapshot holds a point-in-time snapshot of system resources.
type ResourceSnapshot struct {
	CPUPercent float64   `json:"cpu_percent"`
	RAMPercent float64   `json:"ram_percent"`
	GPUPercent float64   `json:"gpu_percent"`
	VRAMMB     float64   `json:"vram_mb"`
	DetectedAt time.Time `json:"detected_at"`
}

// ResourceMonitor tracks CPU, RAM, GPU, and VRAM usage.
type ResourceMonitor struct {
	cfg          *config.Config
	mu           sync.RWMutex
	lastSnapshot ResourceSnapshot
	history      []ResourceSnapshot // Rolling window for spike detection
	maxHistory   int
	onAnomaly    func(ResourceSnapshot, string) // Callback on anomaly with reason
}

// NewResourceMonitor creates a new resource monitor.
func NewResourceMonitor(cfg *config.Config, onAnomaly func(ResourceSnapshot, string)) *ResourceMonitor {
	return &ResourceMonitor{
		cfg:        cfg,
		maxHistory: 60, // Keep ~5 minutes at 5-second intervals
		onAnomaly:  onAnomaly,
	}
}

// Scan captures a single resource usage snapshot.
func (rm *ResourceMonitor) Scan(ctx context.Context) (ResourceSnapshot, error) {
	snapshot := ResourceSnapshot{
		DetectedAt: time.Now(),
	}

	// CPU usage (average across all cores, 1-second sample)
	cpuPcts, err := cpu.PercentWithContext(ctx, time.Second, false)
	if err == nil && len(cpuPcts) > 0 {
		snapshot.CPUPercent = cpuPcts[0]
	}

	// RAM usage
	vmem, err := mem.VirtualMemoryWithContext(ctx)
	if err == nil {
		snapshot.RAMPercent = vmem.UsedPercent
	}

	// GPU usage (nvidia-smi)
	gpuPct, vramMB := rm.getGPUMetrics()
	snapshot.GPUPercent = gpuPct
	snapshot.VRAMMB = vramMB

	// Update state
	rm.mu.Lock()
	rm.lastSnapshot = snapshot
	rm.history = append(rm.history, snapshot)
	if len(rm.history) > rm.maxHistory {
		rm.history = rm.history[1:]
	}
	rm.mu.Unlock()

	// Check for anomalies
	rm.checkAnomalies(snapshot)

	return snapshot, nil
}

// getGPUMetrics queries nvidia-smi for GPU utilization and VRAM usage.
func (rm *ResourceMonitor) getGPUMetrics() (gpuPercent float64, vramMB float64) {
	var cmd *exec.Cmd

	if runtime.GOOS == "windows" {
		cmd = exec.Command("nvidia-smi",
			"--query-gpu=utilization.gpu,memory.used",
			"--format=csv,noheader,nounits")
	} else {
		cmd = exec.Command("nvidia-smi",
			"--query-gpu=utilization.gpu,memory.used",
			"--format=csv,noheader,nounits")
	}

	output, err := cmd.Output()
	if err != nil {
		// nvidia-smi not available or no NVIDIA GPU
		return 0, 0
	}

	// Parse output: "85, 4096"
	parts := strings.Split(strings.TrimSpace(string(output)), ",")
	if len(parts) >= 2 {
		gpuStr := strings.TrimSpace(parts[0])
		vramStr := strings.TrimSpace(parts[1])

		if v, err := strconv.ParseFloat(gpuStr, 64); err == nil {
			gpuPercent = v
		}
		if v, err := strconv.ParseFloat(vramStr, 64); err == nil {
			vramMB = v
		}
	}

	return gpuPercent, vramMB
}

// checkAnomalies detects suspicious resource usage patterns and also triggers the regular telemetry callback.
func (rm *ResourceMonitor) checkAnomalies(snapshot ResourceSnapshot) {
	if rm.onAnomaly == nil {
		return
	}

	reason := ""
	// GPU spike: > 80% sustained for multiple snapshots
	if snapshot.GPUPercent > 80 {
		sustained := rm.isGPUSustained(80, 6) // 6 snapshots = ~30 seconds
		if sustained {
			reason = fmt.Sprintf(
				"GPU usage sustained above 80%% (current: %.1f%%) — possible local LLM inference",
				snapshot.GPUPercent,
			)
		}
	}

	// VRAM spike: > 4GB
	if snapshot.VRAMMB > 4096 {
		sustained := rm.isVRAMSustained(4096, 12) // 12 snapshots = ~60 seconds
		if sustained {
			if reason != "" {
				reason += "; "
			}
			reason += fmt.Sprintf(
				"VRAM usage sustained above 4GB (current: %.0f MB) — possible LLM model loaded",
				snapshot.VRAMMB,
			)
		}
	}
	
	// Always trigger the callback to stream telemetry. Reason will be empty for normal snapshots.
	rm.onAnomaly(snapshot, reason)
}

// isGPUSustained checks if GPU usage has been above threshold for N consecutive snapshots.
func (rm *ResourceMonitor) isGPUSustained(threshold float64, count int) bool {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	if len(rm.history) < count {
		return false
	}

	recent := rm.history[len(rm.history)-count:]
	for _, s := range recent {
		if s.GPUPercent < threshold {
			return false
		}
	}
	return true
}

// isVRAMSustained checks if VRAM usage has been above threshold for N consecutive snapshots.
func (rm *ResourceMonitor) isVRAMSustained(thresholdMB float64, count int) bool {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	if len(rm.history) < count {
		return false
	}

	recent := rm.history[len(rm.history)-count:]
	for _, s := range recent {
		if s.VRAMMB < thresholdMB {
			return false
		}
	}
	return true
}

// Run starts the continuous resource monitoring loop.
func (rm *ResourceMonitor) Run(ctx context.Context) {
	log.Println("[ResourceMonitor] Starting resource monitoring...")

	// Check for GPU availability
	_, vram := rm.getGPUMetrics()
	if vram > 0 {
		log.Println("[ResourceMonitor] NVIDIA GPU detected — GPU/VRAM monitoring enabled.")
	} else {
		log.Println("[ResourceMonitor] No NVIDIA GPU detected — GPU monitoring will return 0.")
	}

	ticker := time.NewTicker(rm.cfg.ResourceScanInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[ResourceMonitor] Stopping.")
			return
		case <-ticker.C:
			if _, err := rm.Scan(ctx); err != nil {
				log.Printf("[ResourceMonitor] Scan error: %v", err)
			}
		}
	}
}

// GetLastSnapshot returns the most recent resource snapshot.
func (rm *ResourceMonitor) GetLastSnapshot() ResourceSnapshot {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	return rm.lastSnapshot
}

// Ensure regexp is used (for future pattern matching)
var _ = regexp.Compile
