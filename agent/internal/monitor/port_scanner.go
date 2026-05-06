// Package monitor provides system monitoring capabilities for the VOIGHT Agent.
package monitor

import (
	"context"
	"fmt"
	"log"
	"net"
	"strings"
	"sync"
	"time"
)

// ──────────────────────────────────────────────
// Known AI Runtime Ports
// ──────────────────────────────────────────────
// AI runtimes must open a local server to function.
// This is a behavioral signal that cannot be faked —
// if a port is listening, the runtime IS serving.

type aiPort struct {
	Port     int
	Name     string          // Human-readable name
	Category ProcessCategory // How to classify this detection
}

var knownAIPorts = []aiPort{
	// Local LLM Runtimes
	{Port: 11434, Name: "Ollama",       Category: CategoryLocalLLM},
	{Port: 1234,  Name: "LM Studio",    Category: CategoryLocalLLM},
	{Port: 5001,  Name: "KoboldCpp",    Category: CategoryLocalLLM},
	{Port: 4891,  Name: "GPT4All",      Category: CategoryLocalLLM},
	{Port: 8080,  Name: "LocalAI",      Category: CategoryLocalLLM},

	// AI Agent Frameworks
	{Port: 3000,  Name: "OpenDevin",    Category: CategoryAIAgent}, // Note: may conflict with dev servers
	{Port: 7860,  Name: "Gradio/HF Spaces", Category: CategoryAIAgent},
	{Port: 8188,  Name: "ComfyUI",      Category: CategoryAIAgent},
}

// Ports that are commonly used by development tools and should NOT be flagged
// even if they appear in knownAIPorts. These are tracked but only flagged
// if corroborated by other signals (process name, signature, etc.)
var ambiguousPorts = map[int]bool{
	3000: true, // React dev server, Next.js, etc.
	8080: true, // Common web server port
}

// PortScanner detects AI runtimes by probing known listening ports.
type PortScanner struct {
	mu           sync.RWMutex
	lastResults  []PortDetection
	probeTimeout time.Duration
}

// PortDetection represents a detected AI runtime via port scanning.
type PortDetection struct {
	Port       int             `json:"port"`
	Name       string          `json:"name"`
	Category   ProcessCategory `json:"category"`
	DetectedAt time.Time       `json:"detected_at"`
	Ambiguous  bool            `json:"ambiguous"` // True if port may be a false positive
}

// NewPortScanner creates a new port scanner.
func NewPortScanner() *PortScanner {
	return &PortScanner{
		probeTimeout: 500 * time.Millisecond,
	}
}

// Scan probes all known AI ports on localhost and returns detected runtimes.
func (ps *PortScanner) Scan(ctx context.Context) []PortDetection {
	var detected []PortDetection
	now := time.Now()

	for _, ap := range knownAIPorts {
		select {
		case <-ctx.Done():
			return detected
		default:
		}

		if ps.isPortOpen(ap.Port) {
			isAmbiguous := ambiguousPorts[ap.Port]

			detection := PortDetection{
				Port:       ap.Port,
				Name:       ap.Name,
				Category:   ap.Category,
				DetectedAt: now,
				Ambiguous:  isAmbiguous,
			}

			if isAmbiguous {
				log.Printf("[PortScanner] Ambiguous port %d (%s) is open — requires corroboration", ap.Port, ap.Name)
			} else {
				log.Printf("[PortScanner] AI runtime detected: %s on port %d", ap.Name, ap.Port)
			}

			detected = append(detected, detection)
		}
	}

	ps.mu.Lock()
	ps.lastResults = detected
	ps.mu.Unlock()

	return detected
}

// isPortOpen checks if a TCP port is listening on localhost.
func (ps *PortScanner) isPortOpen(port int) bool {
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	conn, err := net.DialTimeout("tcp", addr, ps.probeTimeout)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// GetLastResults returns the most recent port scan results.
func (ps *PortScanner) GetLastResults() []PortDetection {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	result := make([]PortDetection, len(ps.lastResults))
	copy(result, ps.lastResults)
	return result
}

// ToProcessInfoList converts port detections into ProcessInfo entries
// so they can be merged into the main telemetry stream.
func (ps *PortScanner) ToProcessInfoList(detections []PortDetection) []ProcessInfo {
	var result []ProcessInfo
	for _, d := range detections {
		// Skip ambiguous ports — they need corroboration from other scanners
		if d.Ambiguous {
			continue
		}

		result = append(result, ProcessInfo{
			Name:       fmt.Sprintf("[Port:%d] %s", d.Port, d.Name),
			PID:        0, // Port scan cannot determine PID
			Cmdline:    fmt.Sprintf("Listening on localhost:%d (behavioral detection)", d.Port),
			Category:   d.Category,
			DetectedAt: d.DetectedAt,
		})
	}
	return result
}

// CorroborateAmbiguous checks if an ambiguous port detection is backed up by
// a matching process name in the detected list. Returns confirmed detections.
func CorroborateAmbiguous(portDetections []PortDetection, processDetections []ProcessInfo) []ProcessInfo {
	var confirmed []ProcessInfo

	for _, pd := range portDetections {
		if !pd.Ambiguous {
			continue
		}

		// Look for a running process that matches this port's expected runtime
		lowerName := strings.ToLower(pd.Name)
		for _, proc := range processDetections {
			if strings.Contains(strings.ToLower(proc.Name), lowerName) {
				confirmed = append(confirmed, ProcessInfo{
					Name:       fmt.Sprintf("[Port:%d+Process] %s", pd.Port, pd.Name),
					PID:        proc.PID,
					Cmdline:    fmt.Sprintf("Corroborated: port %d open + process '%s' running", pd.Port, proc.Name),
					Category:   pd.Category,
					DetectedAt: pd.DetectedAt,
				})
				break
			}
		}
	}

	return confirmed
}
