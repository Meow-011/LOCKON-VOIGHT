// Package watchdog implements a secondary process that monitors the primary VOIGHT agent.
// If the primary agent is terminated, the watchdog detects it and alerts the server.
package watchdog

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"time"
)

const (
	// CheckInterval is how often the watchdog checks if the agent is alive.
	CheckInterval = 3 * time.Second

	// MaxMissedChecks is how many consecutive failures before alerting.
	MaxMissedChecks = 3
)

// Watchdog monitors the primary VOIGHT agent process.
type Watchdog struct {
	agentPID     int
	serverURL    string // Fallback HTTP endpoint to alert server
	missedChecks int
}

// NewWatchdog creates a new watchdog for the given agent PID.
func NewWatchdog(agentPID int, serverURL string) *Watchdog {
	return &Watchdog{
		agentPID:  agentPID,
		serverURL: serverURL,
	}
}

// Run starts the watchdog monitoring loop.
func (w *Watchdog) Run(ctx context.Context) {
	log.Printf("[Watchdog] Monitoring agent PID: %d (check interval: %v)", w.agentPID, CheckInterval)

	ticker := time.NewTicker(CheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[Watchdog] Stopping.")
			return
		case <-ticker.C:
			alive := w.isAgentAlive()

			if alive {
				if w.missedChecks > 0 {
					log.Printf("[Watchdog] Agent recovered (PID: %d).", w.agentPID)
				}
				w.missedChecks = 0
			} else {
				w.missedChecks++
				log.Printf("[Watchdog] Agent not responding (missed: %d/%d)", w.missedChecks, MaxMissedChecks)

				if w.missedChecks >= MaxMissedChecks {
					log.Printf("[Watchdog] Agent terminated! Alerting server...")
					w.alertServer()

					// Attempt to restart the agent
					w.attemptRestart()
				}
			}
		}
	}
}

// isAgentAlive checks if the agent process is still running.
func (w *Watchdog) isAgentAlive() bool {
	process, err := os.FindProcess(w.agentPID)
	if err != nil {
		return false
	}

	// On Unix, FindProcess always succeeds. We need to send signal 0 to check.
	if runtime.GOOS != "windows" {
		err = process.Signal(os.Signal(nil))
		return err == nil
	}

	// On Windows, FindProcess returns an error if the process doesn't exist
	// Use tasklist to verify
	cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", w.agentPID), "/FO", "CSV", "/NH")
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	return len(output) > 0 && string(output) != ""
}

// alertServer sends an HTTP alert to the server about agent termination.
func (w *Watchdog) alertServer() {
	if w.serverURL == "" {
		log.Println("[Watchdog] No server URL configured — cannot alert.")
		return
	}

	alertURL := fmt.Sprintf("%s/api/watchdog/agent-down?pid=%d", w.serverURL, w.agentPID)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, alertURL, nil)
	if err != nil {
		log.Printf("[Watchdog] Failed to create alert request: %v", err)
		return
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[Watchdog] Failed to alert server: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		log.Println("[Watchdog] Server alerted successfully.")
	} else {
		log.Printf("[Watchdog] Server responded with status: %d", resp.StatusCode)
	}
}

// attemptRestart tries to restart the agent binary.
func (w *Watchdog) attemptRestart() {
	execPath, err := os.Executable()
	if err != nil {
		log.Printf("[Watchdog] Cannot determine executable path: %v", err)
		return
	}

	// The watchdog binary is expected to be co-located with the agent binary
	// Agent binary name convention: voight-sentinel (watchdog: voight-watchdog)
	log.Printf("[Watchdog] Restart not implemented — manual intervention required.")
	log.Printf("[Watchdog] Agent binary: %s", execPath)
}

// ─── Watchdog Entry Point (for separate binary) ──────────────────

// RunStandalone starts the watchdog as a standalone process.
// This is called from cmd/watchdog/main.go
func RunStandalone(agentPID int, serverURL string) {
	log.SetPrefix("[VOIGHT-WATCHDOG] ")
	log.Printf("Starting watchdog for agent PID: %d", agentPID)

	w := NewWatchdog(agentPID, serverURL)
	ctx := context.Background()
	w.Run(ctx)
}
