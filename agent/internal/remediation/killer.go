// Package remediation provides automated process termination capabilities.
// When enabled by the Proctor via Dashboard Settings, the Agent will automatically
// kill any processes that have been flagged by the detection engine.
package remediation

import (
	"log"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v3/process"
)

// KillResult records the outcome of a kill attempt.
type KillResult struct {
	PID         int32
	ProcessName string
	Category    string
	Success     bool
	Error       string
	Timestamp   time.Time
}

// Manager handles automated remediation (process killing).
type Manager struct {
	mu      sync.RWMutex
	enabled bool
	history []KillResult
}

// NewManager creates a new remediation manager.
func NewManager() *Manager {
	return &Manager{
		history: make([]KillResult, 0),
	}
}

// SetEnabled enables or disables auto-kill.
func (m *Manager) SetEnabled(enabled bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.enabled != enabled {
		if enabled {
			log.Println("[Remediation] ⚡ AUTO-KILL ENABLED — Flagged processes will be terminated automatically.")
		} else {
			log.Println("[Remediation] Auto-kill DISABLED.")
		}
	}
	m.enabled = enabled
}

// IsEnabled returns whether auto-kill is active.
func (m *Manager) IsEnabled() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.enabled
}

// KillFlaggedProcesses finds and terminates processes matching the given names.
// It returns a list of kill results for logging/telemetry.
func (m *Manager) KillFlaggedProcesses(flaggedNames []string) []KillResult {
	if !m.IsEnabled() || len(flaggedNames) == 0 {
		return nil
	}

	// Build lookup set (lowercase for case-insensitive matching)
	flagged := make(map[string]bool, len(flaggedNames))
	for _, name := range flaggedNames {
		flagged[strings.ToLower(name)] = true
	}

	procs, err := process.Processes()
	if err != nil {
		log.Printf("[Remediation] Failed to list processes: %v", err)
		return nil
	}

	var results []KillResult

	for _, proc := range procs {
		name, err := proc.Name()
		if err != nil {
			continue
		}

		nameLower := strings.ToLower(name)

		// Skip system-critical processes
		if isProtectedProcess(nameLower) {
			continue
		}

		if flagged[nameLower] {
			result := KillResult{
				PID:         proc.Pid,
				ProcessName: name,
				Timestamp:   time.Now(),
			}

			// Attempt to kill
			osProc, err := os.FindProcess(int(proc.Pid))
			if err != nil {
				result.Success = false
				result.Error = err.Error()
			} else {
				if err := osProc.Kill(); err != nil {
					result.Success = false
					result.Error = err.Error()
				} else {
					result.Success = true
					log.Printf("[Remediation] ✅ KILLED: %s (PID: %d)", name, proc.Pid)
				}
			}

			results = append(results, result)

			m.mu.Lock()
			m.history = append(m.history, result)
			// Keep history limited to last 100 entries
			if len(m.history) > 100 {
				m.history = m.history[len(m.history)-100:]
			}
			m.mu.Unlock()
		}
	}

	return results
}

// GetHistory returns the recent kill history.
func (m *Manager) GetHistory() []KillResult {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]KillResult, len(m.history))
	copy(out, m.history)
	return out
}

// isProtectedProcess returns true for OS-critical processes that must never be killed.
func isProtectedProcess(nameLower string) bool {
	// Windows system processes
	if runtime.GOOS == "windows" {
		protected := []string{
			"system", "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe",
			"services.exe", "lsass.exe", "svchost.exe", "explorer.exe",
			"dwm.exe", "taskmgr.exe", "ctfmon.exe", "conhost.exe",
			"sihost.exe", "fontdrvhost.exe", "runtimebroker.exe",
		}
		for _, p := range protected {
			if nameLower == p {
				return true
			}
		}
	}

	// Linux system processes
	if runtime.GOOS == "linux" {
		protected := []string{
			"init", "systemd", "kthreadd", "kworker", "ksoftirqd",
			"rcu_sched", "watchdog", "migration", "sshd", "bash", "sh",
		}
		for _, p := range protected {
			if nameLower == p {
				return true
			}
		}
	}

	// macOS system processes
	if runtime.GOOS == "darwin" {
		protected := []string{
			"launchd", "kernel_task", "windowserver", "loginwindow",
			"sshd", "bash", "zsh", "sh",
		}
		for _, p := range protected {
			if nameLower == p {
				return true
			}
		}
	}

	// Never kill ourselves
	if strings.Contains(nameLower, "voight") {
		return true
	}

	return false
}
