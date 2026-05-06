// Package monitor provides system monitoring capabilities for the VOIGHT Agent.
package monitor

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v3/process"

	"github.com/lockon/voight-agent/internal/config"
)

// ProcessCategory classifies a detected process.
type ProcessCategory string

const (
	CategoryNormal   ProcessCategory = "NORMAL"
	CategoryAIEditor ProcessCategory = "AI_EDITOR"
	CategoryLocalLLM ProcessCategory = "LOCAL_LLM"
	CategoryAIAgent  ProcessCategory = "AI_AGENT"
	CategoryEvasion  ProcessCategory = "EVASION"
)

// ProcessInfo holds information about a running process.
type ProcessInfo struct {
	Name       string          `json:"name"`
	PID        int32           `json:"pid"`
	Cmdline    string          `json:"cmdline"`
	CPUPercent float64         `json:"cpu_percent"`
	MemoryMB   float32         `json:"memory_mb"`
	Category   ProcessCategory `json:"category"`
	DetectedAt time.Time       `json:"detected_at"`
}

// ProcessMonitor scans running processes and classifies them as AI-related or normal.
type ProcessMonitor struct {
	cfg           *config.Config
	mu            sync.RWMutex
	lastSnapshot  []ProcessInfo
	aiProcessMap  map[string]ProcessCategory
	onDetection   func(ProcessInfo) // Callback when AI process is found
	sigScanner    *SignatureScanner // Authenticode digital signature scanner
	portScanner   *PortScanner      // AI runtime port scanner
}

// NewProcessMonitor creates a new process monitor.
func NewProcessMonitor(cfg *config.Config, onDetection func(ProcessInfo)) *ProcessMonitor {
	pm := &ProcessMonitor{
		cfg:         cfg,
		onDetection: onDetection,
		sigScanner:  NewSignatureScanner(),
		portScanner: NewPortScanner(),
	}
	return pm
}

// buildProcessMap creates a lookup map of AI process names to their categories.
func buildProcessMap(cfg *config.Config) map[string]ProcessCategory {
	m := make(map[string]ProcessCategory)

	// AI Editors
	aiEditors := []string{
		"cursor", "cursor.exe",
		"windsurf", "windsurf.exe",
		"aide", "aide.exe",
		"tabnine", "tabnine.exe",
	}
	for _, name := range aiEditors {
		m[strings.ToLower(name)] = CategoryAIEditor
	}

	// Local LLM Runtimes
	localLLMs := []string{
		"ollama", "ollama.exe", "ollama_llama_server", "ollama_llama_server.exe",
		"lms", "lms.exe", "lm-studio", "lm studio.exe",
		"vllm", "llamacpp", "llama-server", "llama-server.exe",
		"koboldcpp", "koboldcpp.exe",
		"text-generation-server",
		"localai", "localai.exe",
	}
	for _, name := range localLLMs {
		m[strings.ToLower(name)] = CategoryLocalLLM
	}

	// AI Agents
	aiAgents := []string{
		"autogpt", "opendevin", "devika",
		"aider", "aider.exe",
		"chatgpt", "chatgpt.exe",
	}
	for _, name := range aiAgents {
		m[strings.ToLower(name)] = CategoryAIAgent
	}

	// Evasion Tools (Proxy, Darknet)
	evasionTools := []string{
		"tor.exe", "v2ray", "shadowsocks",
	}
	for _, name := range evasionTools {
		m[strings.ToLower(name)] = CategoryEvasion
	}

	// Add custom process names from config
	for _, name := range cfg.AIProcessNames {
		lower := strings.ToLower(name)
		if _, exists := m[lower]; !exists {
			m[lower] = CategoryAIAgent // Default to AI_AGENT for custom entries
		}
	}

	return m
}

// Scan performs a single scan of all running processes.
func (pm *ProcessMonitor) Scan(ctx context.Context) ([]ProcessInfo, error) {
	pm.mu.Lock()
	pm.aiProcessMap = buildProcessMap(pm.cfg)
	pm.mu.Unlock()

	procs, err := process.ProcessesWithContext(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list processes: %w", err)
	}

	var snapshot []ProcessInfo
	var detected []ProcessInfo

	for _, p := range procs {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		info, err := pm.inspectProcess(ctx, p)
		if err != nil {
			continue // Skip processes we can't inspect (permission denied, etc.)
		}

		snapshot = append(snapshot, info)

		if info.Category != CategoryNormal {
			detected = append(detected, info)
		}
	}

	// Check Window Titles (Catches AI Web Chats in Browsers)
	winProcs, err := pm.checkWindowTitles(ctx)
	if err == nil && len(winProcs) > 0 {
		for _, wp := range winProcs {
			snapshot = append(snapshot, wp)
			detected = append(detected, wp)
		}
	}

	// ── Port Scanning (Behavioral Detection) ──
	// Probe known AI runtime ports on localhost
	portDetections := pm.portScanner.Scan(ctx)

	// Convert non-ambiguous port detections to ProcessInfo
	portProcs := pm.portScanner.ToProcessInfoList(portDetections)
	for _, pp := range portProcs {
		snapshot = append(snapshot, pp)
		detected = append(detected, pp)
	}

	// Corroborate ambiguous ports with process detections
	corroborated := CorroborateAmbiguous(portDetections, detected)
	for _, cp := range corroborated {
		snapshot = append(snapshot, cp)
		detected = append(detected, cp)
	}

	// Update last snapshot
	pm.mu.Lock()
	pm.lastSnapshot = snapshot
	pm.mu.Unlock()

	// Fire callbacks for detected AI processes
	if pm.onDetection != nil {
		for _, d := range detected {
			pm.onDetection(d)
		}
	}

	return snapshot, nil
}

// checkWindowTitles uses PowerShell to scan all active window titles for AI chat keywords.
func (pm *ProcessMonitor) checkWindowTitles(ctx context.Context) ([]ProcessInfo, error) {
	if runtime.GOOS != "windows" {
		return nil, nil
	}

	cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", `Get-Process | Where-Object {$_.MainWindowTitle -ne ""} | Select-Object Name, MainWindowTitle, Id | ConvertTo-Json`)
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	if len(out) == 0 {
		return nil, nil
	}

	type WinProc struct {
		Name            string `json:"Name"`
		MainWindowTitle string `json:"MainWindowTitle"`
		Id              int    `json:"Id"`
	}

	var procs []WinProc
	if err := json.Unmarshal(out, &procs); err != nil {
		var single WinProc
		if err := json.Unmarshal(out, &single); err == nil {
			procs = []WinProc{single}
		} else {
			return nil, err
		}
	}

	var detected []ProcessInfo
	now := time.Now()

	aiKeywords := []string{
		"chatgpt", "claude", "gemini", "deepseek", "perplexity", "poe", "grok",
	}

	for _, p := range procs {
		lowerTitle := strings.ToLower(p.MainWindowTitle)
		isAI := false

		for _, kw := range aiKeywords {
			if strings.Contains(lowerTitle, kw) {
				isAI = true
				break
			}
		}

		// Also check dynamic processes
		if !isAI {
			for _, name := range pm.cfg.AIProcessNames {
				if name != "" && strings.Contains(lowerTitle, strings.ToLower(name)) {
					isAI = true
					break
				}
			}
		}

		if isAI {
			// VULN MITIGATION: Only flag if the process is a known web browser.
			// Otherwise, opening a file named "chatgpt.txt" in notepad.exe will trigger a false positive.
			lowerProcName := strings.ToLower(p.Name)
			isBrowser := false
			browsers := []string{"chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "safari", "arc", "waterfox"}
			for _, b := range browsers {
				if strings.Contains(lowerProcName, b) {
					isBrowser = true
					break
				}
			}

			if isBrowser {
				detected = append(detected, ProcessInfo{
					Name:       p.Name + ".exe",
					PID:        int32(p.Id),
					Cmdline:    p.MainWindowTitle, // Store the Window Title in Cmdline for forensic evidence
					Category:   CategoryAIAgent,   // Classify web chats as AI Agents
					DetectedAt: now,
				})
			}
		}
	}

	return detected, nil
}

// inspectProcess extracts information from a single process.
func (pm *ProcessMonitor) inspectProcess(ctx context.Context, p *process.Process) (ProcessInfo, error) {
	name, err := p.NameWithContext(ctx)
	if err != nil {
		return ProcessInfo{}, err
	}

	cmdline, _ := p.CmdlineWithContext(ctx)
	exePath, _ := p.ExeWithContext(ctx)

	cpuPct, _ := p.CPUPercentWithContext(ctx)

	memInfo, _ := p.MemoryInfoWithContext(ctx)
	var memMB float32
	if memInfo != nil {
		memMB = float32(memInfo.RSS) / (1024 * 1024)
	}

	category := pm.classifyProcess(name, cmdline, exePath)

	// ── Signature Verification (Secondary Check) ──
	// If name-based detection says NORMAL, do a deeper check
	// via Authenticode digital signature to catch renamed executables.
	if category == CategoryNormal && exePath != "" {
		sigCategory := pm.sigScanner.CheckSignature(ctx, exePath)
		if sigCategory != CategoryNormal {
			log.Printf("[ProcessMonitor] Signature-based detection: %s (name: %s) -> %s", exePath, name, sigCategory)
			category = sigCategory
		}
	}

	return ProcessInfo{
		Name:       name,
		PID:        p.Pid,
		Cmdline:    cmdline,
		CPUPercent: cpuPct,
		MemoryMB:   memMB,
		Category:   category,
		DetectedAt: time.Now(),
	}, nil
}

// classifyProcess determines if a process is AI-related.
func (pm *ProcessMonitor) classifyProcess(name, cmdline, exePath string) ProcessCategory {
	lowerName := strings.ToLower(name)
	lowerExe := strings.ToLower(exePath)

	// Direct name match
	if cat, found := pm.aiProcessMap[lowerName]; found {
		return cat
	}

	// Check if process name or absolute path contains known AI tool names
	for aiName, cat := range pm.aiProcessMap {
		// VULN MITIGATION: Only use strings.Contains for names longer than 4 chars
		// Otherwise short acronyms like "lms" will match "films.exe"
		if len(aiName) > 4 && strings.Contains(lowerName, aiName) {
			return cat
		}
		// VULN-2 MITIGATION: If they renamed cursor.exe to notepad.exe, 
		// the folder path (e.g. AppData\Local\Programs\cursor\notepad.exe) still reveals it.
		// Exclude basic names like 'aide' from path matching to prevent false positives in C:\aide\...
		if len(aiName) > 4 && strings.Contains(lowerExe, "\\"+aiName+"\\") {
			return cat
		}
	}

	// Check command line for AI-related patterns
	lowerCmd := strings.ToLower(cmdline)
	if pm.isCmdlineAI(lowerCmd) {
		return CategoryAIAgent
	}

	return CategoryNormal
}

// isCmdlineAI checks command line arguments for AI-related patterns.
func (pm *ProcessMonitor) isCmdlineAI(cmdline string) bool {
	// Python scripts running AI frameworks (using specific runtime patterns to avoid blocking standard script names)
	aiPatterns := []string{
		"ollama serve",
		"ollama run",
		"vllm.entrypoints",
		"text_generation_server",
		"llama_cpp",
		"koboldcpp",
	}

	for _, pattern := range aiPatterns {
		if strings.Contains(cmdline, pattern) {
			return true
		}
	}

	return false
}

// Run starts the continuous process monitoring loop.
func (pm *ProcessMonitor) Run(ctx context.Context) {
	log.Println("[ProcessMonitor] Starting process scanning...")
	ticker := time.NewTicker(pm.cfg.ProcessScanInterval)
	defer ticker.Stop()

	// Initial scan
	if _, err := pm.Scan(ctx); err != nil {
		log.Printf("[ProcessMonitor] Initial scan error: %v", err)
	}

	for {
		select {
		case <-ctx.Done():
			log.Println("[ProcessMonitor] Stopping.")
			return
		case <-ticker.C:
			if _, err := pm.Scan(ctx); err != nil {
				log.Printf("[ProcessMonitor] Scan error: %v", err)
			}
		}
	}
}

// GetLastSnapshot returns the most recent process snapshot.
func (pm *ProcessMonitor) GetLastSnapshot() []ProcessInfo {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	result := make([]ProcessInfo, len(pm.lastSnapshot))
	copy(result, pm.lastSnapshot)
	return result
}

// GetDetectedAI returns only AI-classified processes from the last snapshot.
func (pm *ProcessMonitor) GetDetectedAI() []ProcessInfo {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	var result []ProcessInfo
	for _, p := range pm.lastSnapshot {
		if p.Category != CategoryNormal {
			result = append(result, p)
		}
	}
	return result
}
