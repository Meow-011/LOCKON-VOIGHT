// Package monitor provides system monitoring capabilities for the VOIGHT Agent.
package monitor

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
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

	// Evasion Tools (Proxy, Darknet, Tunnels)
	evasionTools := []string{
		"tor.exe", "v2ray", "shadowsocks",
		"chisel", "chisel.exe",
		"frp", "frpc", "frpc.exe",
		"ngrok", "ngrok.exe",
		"cloudflared", "cloudflared.exe",
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

// checkWindowTitles scans all active window titles for AI chat keywords.
// Supports: Windows (PowerShell), macOS (AppleScript), Linux (wmctrl).
func (pm *ProcessMonitor) checkWindowTitles(ctx context.Context) ([]ProcessInfo, error) {
	switch runtime.GOOS {
	case "windows":
		return pm.checkWindowTitlesWindows(ctx)
	case "darwin":
		return pm.checkWindowTitlesDarwin(ctx)
	case "linux":
		return pm.checkWindowTitlesLinux(ctx)
	default:
		return nil, nil
	}
}

// checkWindowTitlesWindows uses PowerShell to scan active window titles.
func (pm *ProcessMonitor) checkWindowTitlesWindows(ctx context.Context) ([]ProcessInfo, error) {
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

// checkWindowTitlesDarwin uses AppleScript to scan active window titles on macOS.
func (pm *ProcessMonitor) checkWindowTitlesDarwin(ctx context.Context) ([]ProcessInfo, error) {
	// AppleScript to list all visible windows with their process name and title
	script := `
tell application "System Events"
	set output to ""
	repeat with proc in (every process whose visible is true)
		set procName to name of proc
		repeat with win in (every window of proc)
			try
				set winTitle to name of win
				set output to output & procName & "|||" & winTitle & "
"
			end try
		end repeat
	end repeat
	return output
end tell`

	cmd := exec.CommandContext(ctx, "osascript", "-e", script)
	out, err := cmd.Output()
	if err != nil {
		return nil, nil // Silently fail if Accessibility permissions not granted
	}

	var detected []ProcessInfo
	now := time.Now()

	aiKeywords := []string{
		"chatgpt", "claude", "gemini", "deepseek", "perplexity", "poe", "grok",
	}
	browsers := []string{"chrome", "safari", "firefox", "brave", "opera", "vivaldi", "arc", "edge", "waterfox", "orion"}

	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, "|||", 2)
		if len(parts) != 2 {
			continue
		}

		procName := strings.TrimSpace(parts[0])
		winTitle := strings.TrimSpace(parts[1])
		lowerTitle := strings.ToLower(winTitle)
		lowerProc := strings.ToLower(procName)

		isAI := false
		for _, kw := range aiKeywords {
			if strings.Contains(lowerTitle, kw) {
				isAI = true
				break
			}
		}

		if isAI {
			// Only flag if the process is a known browser
			isBrowser := false
			for _, b := range browsers {
				if strings.Contains(lowerProc, b) {
					isBrowser = true
					break
				}
			}

			if isBrowser {
				detected = append(detected, ProcessInfo{
					Name:       procName,
					PID:        0, // AppleScript doesn't return PID easily
					Cmdline:    winTitle,
					Category:   CategoryAIAgent,
					DetectedAt: now,
				})
			}
		}
	}

	return detected, nil
}

// checkWindowTitlesLinux scans active window titles on Linux.
// Strategy: xdotool → wmctrl → /proc-based browser cmdline scan.
func (pm *ProcessMonitor) checkWindowTitlesLinux(ctx context.Context) ([]ProcessInfo, error) {
	aiKeywords := []string{
		"chatgpt", "claude", "gemini", "deepseek", "perplexity", "poe", "grok",
	}
	browsers := []string{"chrome", "chromium", "firefox", "brave", "opera", "vivaldi"}

	// Strategy 1: Try xdotool to list all windows with names (works on X11 + some Wayland via XWayland)
	out, err := exec.CommandContext(ctx, "bash", "-c",
		`xdotool search --name '' 2>/dev/null | while read wid; do xdotool getwindowname "$wid" 2>/dev/null; done`,
	).Output()
	if err != nil || len(out) == 0 {
		// Strategy 2: Try wmctrl
		out, err = exec.CommandContext(ctx, "wmctrl", "-l").Output()
	}
	if err != nil || len(out) == 0 {
		// Strategy 3: Scan /proc for browser cmdlines containing AI keywords
		return pm.scanProcCmdlinesLinux(ctx, aiKeywords, browsers)
	}

	var detected []ProcessInfo
	now := time.Now()

	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		lowerLine := strings.ToLower(line)
		isAI := false
		for _, kw := range aiKeywords {
			if strings.Contains(lowerLine, kw) {
				isAI = true
				break
			}
		}

		if isAI {
			isBrowser := false
			for _, b := range browsers {
				if strings.Contains(lowerLine, b) {
					isBrowser = true
					break
				}
			}

			if isBrowser {
				detected = append(detected, ProcessInfo{
					Name:       "[WindowTitle] " + line,
					PID:        0,
					Cmdline:    line,
					Category:   CategoryAIAgent,
					DetectedAt: now,
				})
			}
		}
	}

	return detected, nil
}

// scanProcCmdlinesLinux reads /proc/PID/cmdline for known browser processes
// to detect AI-related URLs or page titles in the command line arguments.
// This works on ALL Linux systems (even headless) because /proc is always available.
func (pm *ProcessMonitor) scanProcCmdlinesLinux(ctx context.Context, aiKeywords, browsers []string) ([]ProcessInfo, error) {
	// List all PIDs from /proc
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, nil
	}

	var detected []ProcessInfo
	now := time.Now()

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		// Skip non-numeric directories
		pid := entry.Name()
		if len(pid) == 0 || pid[0] < '0' || pid[0] > '9' {
			continue
		}

		// Read cmdline
		cmdlineBytes, err := os.ReadFile("/proc/" + pid + "/cmdline")
		if err != nil {
			continue
		}

		// cmdline fields are separated by null bytes
		cmdline := strings.ToLower(strings.ReplaceAll(string(cmdlineBytes), "\x00", " "))

		// Check if this is a browser process
		isBrowser := false
		for _, b := range browsers {
			if strings.Contains(cmdline, b) {
				isBrowser = true
				break
			}
		}
		if !isBrowser {
			continue
		}

		// Check if cmdline contains AI keywords (e.g., browser opening chatgpt.com)
		for _, kw := range aiKeywords {
			if strings.Contains(cmdline, kw) {
				detected = append(detected, ProcessInfo{
					Name:       "[ProcScan] " + pid,
					PID:        0,
					Cmdline:    strings.TrimSpace(cmdline),
					Category:   CategoryAIAgent,
					DetectedAt: now,
				})
				break
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
		// the folder path (e.g. AppData/Local/Programs/cursor/notepad.exe) still reveals it.
		// Exclude basic names like 'aide' from path matching to prevent false positives.
		// Use both \ (Windows) and / (Unix) path separators for cross-platform support.
		if len(aiName) > 4 {
			if strings.Contains(lowerExe, "\\"+aiName+"\\") || strings.Contains(lowerExe, "/"+aiName+"/") {
				return cat
			}
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

	// ── SSH Tunnel Evasion Detection ──
	// Catches: ssh -L 11434:localhost:11434 remote-server
	//          ssh -L 1234:0.0.0.0:1234 user@host
	//          ssh -R ... (reverse tunnel)
	if strings.Contains(cmdline, "ssh") && (strings.Contains(cmdline, "-L") || strings.Contains(cmdline, "-R")) {
		// Check if any known AI port appears in the tunnel spec
		for _, ap := range knownAIPorts {
			portStr := fmt.Sprintf("%d", ap.Port)
			if strings.Contains(cmdline, portStr) {
				return true
			}
		}
	}

	// ── Reverse Proxy Evasion Detection ──
	// Catches: socat TCP-LISTEN:11434,fork TCP:remote:11434
	//          netsh interface portproxy ...
	if strings.Contains(cmdline, "socat") || strings.Contains(cmdline, "portproxy") {
		for _, ap := range knownAIPorts {
			portStr := fmt.Sprintf("%d", ap.Port)
			if strings.Contains(cmdline, portStr) {
				return true
			}
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
