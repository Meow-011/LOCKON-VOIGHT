// Package monitor provides system monitoring capabilities for the VOIGHT Agent.
package monitor

import (
	"context"
	"fmt"
	"log"
	"net"
	"os/exec"
	"runtime"
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

// Scan probes all known AI ports on localhost AND detected VM NAT subnets,
// then returns detected runtimes. This defeats running AI inside VMs with NAT.
func (ps *PortScanner) Scan(ctx context.Context) []PortDetection {
	var detected []PortDetection
	now := time.Now()

	// Build the list of target IPs: localhost + VM NAT gateways
	targets := ps.getProbeTargets()

	for _, ap := range knownAIPorts {
		select {
		case <-ctx.Done():
			return detected
		default:
		}

		for _, target := range targets {
			if ps.isPortOpenAt(target.IP, ap.Port) {
				isAmbiguous := ambiguousPorts[ap.Port]

			label := ap.Name
				if target.Source != "localhost" {
					label = fmt.Sprintf("%s [VM:%s]", ap.Name, target.Source)
					// VM-based detections are never ambiguous — if an AI port
					// is open on a VM NAT interface, it's intentional.
					isAmbiguous = false
				}

				detection := PortDetection{
					Port:       ap.Port,
					Name:       label,
					Category:   ap.Category,
					DetectedAt: now,
					Ambiguous:  isAmbiguous,
				}

				if isAmbiguous {
					log.Printf("[PortScanner] Ambiguous port %d (%s) is open — requires corroboration", ap.Port, ap.Name)
				} else {
					log.Printf("[PortScanner] AI runtime detected: %s on %s:%d", label, target.IP, ap.Port)
				}

				detected = append(detected, detection)
				break // Don't probe same port on multiple IPs if already found
			}
		}
	}

	ps.mu.Lock()
	ps.lastResults = detected
	ps.mu.Unlock()

	return detected
}

// probeTarget represents an IP to probe with its source context.
type probeTarget struct {
	IP     string // e.g., "127.0.0.1", "192.168.152.1"
	Source string // e.g., "localhost", "VMware", "VirtualBox"
}

// getProbeTargets returns localhost + any discovered VM NAT gateway IPs + live VM guests.
// VM NAT gateways are typically at .1 or .2 of the VM's subnet.
// Live VM guests are discovered via the OS ARP table.
func (ps *PortScanner) getProbeTargets() []probeTarget {
	targets := []probeTarget{
		{IP: "127.0.0.1", Source: "localhost"},
	}

	// Enumerate all network interfaces to find VM-related adapters
	ifaces, err := net.Interfaces()
	if err != nil {
		return targets
	}

	// Known VM adapter name patterns
	vmPatterns := []struct {
		Pattern string
		Label   string
	}{
		{"vmnet", "VMware"},
		{"vmware", "VMware"},
		{"vboxnet", "VirtualBox"},
		{"virtualbox", "VirtualBox"},
		{"virbr", "KVM/libvirt"},
		{"hyper-v", "Hyper-V"},
		{"vethernet", "Hyper-V"},
		{"docker", "Docker"},
		{"br-", "Docker-Bridge"},
	}

	seen := make(map[string]bool)
	seen["127.0.0.1"] = true

	// Track VM subnets for ARP scanning
	type vmSubnet struct {
		Network *net.IPNet
		Label   string
	}
	var vmSubnets []vmSubnet

	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 {
			continue // skip down interfaces
		}

		lowerName := strings.ToLower(iface.Name)
		vmLabel := ""
		for _, vp := range vmPatterns {
			if strings.Contains(lowerName, vp.Pattern) {
				vmLabel = vp.Label
				break
			}
		}
		if vmLabel == "" {
			continue // not a VM interface
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			var ip net.IP
			var ipNet *net.IPNet
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
				ipNet = v
			case *net.IPAddr:
				ip = v.IP
			}

			if ip == nil || ip.IsLoopback() || ip.To4() == nil {
				continue
			}

			// The host's IP on the VM interface IS the gateway from the VM's perspective.
			hostIP := ip.String()
			if !seen[hostIP] {
				seen[hostIP] = true
				targets = append(targets, probeTarget{IP: hostIP, Source: vmLabel})
			}

			// Also probe the .2 address (common for VMware DHCP/gateway)
			ip4 := ip.To4()
			gatewayIP := fmt.Sprintf("%d.%d.%d.2", ip4[0], ip4[1], ip4[2])
			if !seen[gatewayIP] {
				seen[gatewayIP] = true
				targets = append(targets, probeTarget{IP: gatewayIP, Source: vmLabel})
			}

			// Remember this subnet for ARP scanning
			if ipNet != nil {
				vmSubnets = append(vmSubnets, vmSubnet{Network: ipNet, Label: vmLabel})
			}
		}
	}

	// ── ARP Table Scanning ──
	// Discover live VM guest IPs by reading the OS ARP cache.
	// This catches VMs with DHCP-assigned IPs (e.g., 192.168.152.128)
	// that we can't predict from the host interface alone.
	arpIPs := ps.discoverARPHosts()
	for _, arpEntry := range arpIPs {
		if seen[arpEntry] {
			continue
		}

		arpIP := net.ParseIP(arpEntry)
		if arpIP == nil {
			continue
		}

		// Only include ARP entries that belong to a VM subnet
		for _, subnet := range vmSubnets {
			if subnet.Network.Contains(arpIP) {
				seen[arpEntry] = true
				targets = append(targets, probeTarget{IP: arpEntry, Source: subnet.Label})
				break
			}
		}
	}

	if len(targets) > 1 {
		log.Printf("[PortScanner] Probing %d targets: %v", len(targets), targets)
	}

	return targets
}

// discoverARPHosts reads the OS ARP table to find live hosts on the network.
// Returns a list of IP addresses that have been seen in the ARP cache.
func (ps *PortScanner) discoverARPHosts() []string {
	var ips []string

	switch runtime.GOOS {
	case "windows":
		// Windows: arp -a
		out, err := exec.Command("arp", "-a").Output()
		if err != nil {
			return ips
		}
		// Parse lines like: "  192.168.152.128     00-0c-29-xx-xx-xx     dynamic"
		for _, line := range strings.Split(string(out), "\n") {
			line = strings.TrimSpace(line)
			fields := strings.Fields(line)
			if len(fields) >= 3 {
				ip := net.ParseIP(fields[0])
				if ip != nil && ip.To4() != nil && !ip.IsLoopback() {
					ips = append(ips, fields[0])
				}
			}
		}

	case "linux":
		// Linux: ip neigh (preferred) or arp -a
		out, err := exec.Command("ip", "neigh").Output()
		if err != nil {
			out, err = exec.Command("arp", "-a").Output()
			if err != nil {
				return ips
			}
		}
		// Parse lines like: "192.168.152.128 dev vmnet8 lladdr 00:0c:29:xx:xx:xx REACHABLE"
		for _, line := range strings.Split(string(out), "\n") {
			fields := strings.Fields(line)
			if len(fields) >= 1 {
				ip := net.ParseIP(fields[0])
				if ip != nil && ip.To4() != nil && !ip.IsLoopback() {
					ips = append(ips, fields[0])
				}
			}
		}

	case "darwin":
		// macOS: arp -a
		out, err := exec.Command("arp", "-a").Output()
		if err != nil {
			return ips
		}
		// Parse lines like: "? (192.168.152.128) at 00:0c:29:xx:xx:xx on vmnet8"
		for _, line := range strings.Split(string(out), "\n") {
			// Extract IP from parentheses
			start := strings.Index(line, "(")
			end := strings.Index(line, ")")
			if start >= 0 && end > start {
				ipStr := line[start+1 : end]
				ip := net.ParseIP(ipStr)
				if ip != nil && ip.To4() != nil && !ip.IsLoopback() {
					ips = append(ips, ipStr)
				}
			}
		}
	}

	return ips
}

// isPortOpenAt checks if a TCP port is listening on a specific IP address.
func (ps *PortScanner) isPortOpenAt(ip string, port int) bool {
	addr := fmt.Sprintf("%s:%d", ip, port)
	conn, err := net.DialTimeout("tcp", addr, ps.probeTimeout)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// isPortOpen checks if a TCP port is listening on localhost (backward compat).
func (ps *PortScanner) isPortOpen(port int) bool {
	return ps.isPortOpenAt("127.0.0.1", port)
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
			Cmdline:    fmt.Sprintf("AI runtime '%s' detected on port %d (behavioral port scan)", d.Name, d.Port),
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
