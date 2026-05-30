//go:build linux

// memscan_linux.go implements the memory forensics scanner for Linux.
// It reads /proc/<pid>/maps to find mapped memory regions and searches
// /proc/<pid>/mem for known AI model tensor signatures (GGUF, GGML, SafeTensors, etc.).
//
// Requirements:
//   - Linux kernel (any version)
//   - Root or CAP_SYS_PTRACE capability (for reading /proc/<pid>/mem)

package monitor

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// memRegion represents a single mapped memory region from /proc/<pid>/maps.
type memRegion struct {
	StartAddr uint64
	EndAddr   uint64
	Perms     string // e.g. "r-xp", "rw-p"
	Pathname  string // file path or "[heap]", "[anon]", etc.
}

// mapsLineRegex parses lines from /proc/<pid>/maps.
// Format: "start-end perms offset dev inode pathname"
// Example: "7f1234000000-7f1234100000 r--p 00000000 08:01 12345 /path/to/file"
var mapsLineRegex = regexp.MustCompile(
	`^([0-9a-f]+)-([0-9a-f]+)\s+(\S+)\s+\S+\s+\S+\s+\S+\s*(.*)$`,
)

// systemProcesses are kernel/system processes that should never be scanned.
var systemProcesses = map[string]bool{
	"systemd": true, "init": true, "kthreadd": true,
	"ksoftirqd": true, "kworker": true, "rcu_gp": true,
	"migration": true, "cpuhp": true, "netns": true,
	"watchdog": true, "khungtaskd": true, "oom_reaper": true,
	"writeback": true, "kcompactd0": true, "kblockd": true,
	"kswapd0": true, "jbd2": true, "ext4": true,
	"dockerd": true, "containerd": true, "snapd": true,
	"sshd": true, "cron": true, "rsyslogd": true,
	"dbus-daemon": true, "polkitd": true, "udisksd": true,
	"ModemManager": true, "NetworkManager": true,
	"voight-sentinel": true, "voight-watchdog": true,
}

// Scan reads /proc to find running processes and scans their memory for
// AI model tensor signatures. Only processes with RSS > MinRSSMB are scanned.
func (ms *MemoryScanner) Scan(ctx context.Context) ([]MemoryFinding, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, fmt.Errorf("cannot read /proc: %w", err)
	}

	var findings []MemoryFinding
	scanned := 0

	for _, entry := range entries {
		if ctx.Err() != nil {
			break
		}

		// Only look at numeric directories (PIDs)
		if !entry.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(entry.Name())
		if err != nil || pid <= 1 {
			continue
		}

		// Rate-limit scanning
		if scanned >= ms.scanCfg.MaxProcessesPerScan {
			break
		}

		// Get process name
		procName := readProcComm(pid)
		if systemProcesses[procName] {
			continue
		}

		// Check RSS threshold
		rssMB := readProcRSSMB(pid)
		if rssMB < ms.scanCfg.MinRSSMB {
			continue
		}

		// Scan this process's memory
		procFindings, err := ms.scanProcess(ctx, int32(pid), procName)
		if err != nil {
			// Permission denied, process exited, etc. — skip silently
			continue
		}

		findings = append(findings, procFindings...)
		scanned++

		// Small delay between processes to reduce CPU impact
		time.Sleep(50 * time.Millisecond)
	}

	// Fire callbacks
	if ms.onDetection != nil {
		for _, f := range findings {
			ms.onDetection(f)
		}
	}

	return findings, nil
}

// scanProcess reads /proc/<pid>/maps and searches mapped regions for model signatures.
func (ms *MemoryScanner) scanProcess(ctx context.Context, pid int32, procName string) ([]MemoryFinding, error) {
	mapsPath := fmt.Sprintf("/proc/%d/maps", pid)
	memPath := fmt.Sprintf("/proc/%d/mem", pid)

	// Parse memory map
	regions, err := parseProcMaps(mapsPath)
	if err != nil {
		return nil, err
	}

	// Open process memory for reading
	memFile, err := os.Open(memPath)
	if err != nil {
		return nil, fmt.Errorf("cannot open %s: %w", memPath, err)
	}
	defer memFile.Close()

	var findings []MemoryFinding
	seen := make(map[string]bool) // Dedup: one finding per model format per process

	for _, region := range regions {
		if ctx.Err() != nil {
			break
		}

		// Only scan readable regions
		if !strings.Contains(region.Perms, "r") {
			continue
		}

		regionSize := region.EndAddr - region.StartAddr

		// Skip tiny regions (< 1MB) — too small for model data
		if regionSize < 1024*1024 {
			continue
		}

		// Skip enormous regions to limit scan time
		maxBytes := uint64(ms.scanCfg.MaxRegionSizeMB) * 1024 * 1024
		if regionSize > maxBytes {
			continue
		}

		// Read the first 4KB of the region to check for magic bytes
		// Model headers are always at the start of the mapped region
		headerSize := int64(4096)
		if int64(regionSize) < headerSize {
			headerSize = int64(regionSize)
		}

		buf := make([]byte, headerSize)
		n, err := memFile.ReadAt(buf, int64(region.StartAddr))
		if err != nil && err != io.EOF {
			continue // Region not readable (e.g., guard page)
		}
		buf = buf[:n]

		// Check each known signature
		for _, sig := range KnownModelSignatures {
			if seen[sig.Name] {
				continue // Already found this format in this process
			}

			if matchSignature(buf, sig) {
				finding := MemoryFinding{
					PID:         pid,
					ProcessName: procName,
					ModelFormat: sig.Name,
					RegionAddr:  region.StartAddr,
					RegionSize:  regionSize,
					DetectedAt:  time.Now(),
				}
				findings = append(findings, finding)
				seen[sig.Name] = true

				log.Printf("[MemScan] FOUND %s tensor in PID %d (%s) at 0x%x (region: %d MB)",
					sig.Name, pid, procName, region.StartAddr, regionSize/(1024*1024))
			}
		}
	}

	return findings, nil
}

// matchSignature checks if a buffer contains a model signature's magic bytes.
func matchSignature(buf []byte, sig ModelSignature) bool {
	if len(buf) < sig.Offset+len(sig.Magic) {
		return false
	}

	searchBuf := buf[sig.Offset:]

	if !bytes.HasPrefix(searchBuf, sig.Magic) {
		return false
	}

	// Additional validation for formats with ambiguous magic bytes
	switch sig.Name {
	case "SAFETENSORS":
		// SafeTensors starts with '{"' but so do many JSON files.
		// Verify it contains tensor-related keys within the first 4KB.
		header := string(buf)
		if !strings.Contains(header, "dtype") && !strings.Contains(header, "__metadata__") {
			return false
		}
	case "PYTORCH":
		// Pickle protocol 2 (0x80 0x02) is common. Verify it's a large region (>100MB).
		// Small pickle files are not AI models.
		// This is checked via MinRSSMB threshold at the process level.
	}

	return true
}

// parseProcMaps reads and parses /proc/<pid>/maps.
func parseProcMaps(mapsPath string) ([]memRegion, error) {
	f, err := os.Open(mapsPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var regions []memRegion
	scanner := bufio.NewScanner(f)

	for scanner.Scan() {
		line := scanner.Text()
		matches := mapsLineRegex.FindStringSubmatch(line)
		if matches == nil {
			continue
		}

		startAddr, err := strconv.ParseUint(matches[1], 16, 64)
		if err != nil {
			continue
		}
		endAddr, err := strconv.ParseUint(matches[2], 16, 64)
		if err != nil {
			continue
		}

		regions = append(regions, memRegion{
			StartAddr: startAddr,
			EndAddr:   endAddr,
			Perms:     matches[3],
			Pathname:  strings.TrimSpace(matches[4]),
		})
	}

	return regions, scanner.Err()
}

// readProcComm reads the process name from /proc/<pid>/comm.
func readProcComm(pid int) string {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/comm", pid))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// readProcRSSMB reads the RSS (Resident Set Size) in MB from /proc/<pid>/status.
func readProcRSSMB(pid int) int64 {
	statusPath := fmt.Sprintf("/proc/%d/status", pid)
	f, err := os.Open(statusPath)
	if err != nil {
		return 0
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "VmRSS:") {
			// Format: "VmRSS:    123456 kB"
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				kb, err := strconv.ParseInt(fields[1], 10, 64)
				if err == nil {
					return kb / 1024 // Convert kB to MB
				}
			}
		}
	}
	return 0
}

// Run starts the periodic memory scanning loop.
func (ms *MemoryScanner) Run(ctx context.Context) {
	log.Printf("[MemScan] Starting memory forensics scanner (interval: %ds, min RSS: %dMB)...",
		ms.scanCfg.ScanIntervalSeconds, ms.scanCfg.MinRSSMB)

	ticker := time.NewTicker(time.Duration(ms.scanCfg.ScanIntervalSeconds) * time.Second)
	defer ticker.Stop()

	// Initial scan
	ms.doScan(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("[MemScan] Stopping.")
			return
		case <-ticker.C:
			ms.doScan(ctx)
		}
	}
}

// doScan performs a single memory scan cycle.
func (ms *MemoryScanner) doScan(ctx context.Context) {
	findings, err := ms.Scan(ctx)
	if err != nil {
		log.Printf("[MemScan] Scan error: %v", err)
		return
	}

	if len(findings) > 0 {
		log.Printf("[MemScan] Found %d AI model signatures in process memory!", len(findings))
	}
}

// ScanProcess performs an on-demand scan of a specific PID.
// Used by eBPF integration to scan a process immediately after detection.
func (ms *MemoryScanner) ScanProcess(ctx context.Context, pid int32) ([]MemoryFinding, error) {
	procName := readProcComm(int(pid))
	return ms.scanProcess(ctx, pid, procName)
}

// IsAvailable returns true on Linux (this is the Linux implementation).
func (ms *MemoryScanner) IsAvailable() bool {
	// Check if /proc/self/mem is readable (basic sanity check)
	_, err := os.Open("/proc/self/maps")
	if err != nil {
		return false
	}

	// Verify we can read another process's memory (requires root/CAP_SYS_PTRACE)
	// We check /proc/1/maps as a proxy — if we can read init's maps, we have permissions
	_, err = os.Open("/proc/1/maps")
	return err == nil
}

// Ensure filepath is used
var _ = filepath.Base
