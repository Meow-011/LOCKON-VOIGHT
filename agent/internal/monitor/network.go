package monitor

import (
	"context"
	"fmt"
	"log"
	"net"
	"strings"
	"sync"
	"time"

	"encoding/json"
	"os/exec"
	"runtime"

	psnet "github.com/shirou/gopsutil/v3/net"

	"github.com/lockon/voight-agent/internal/config"
)

// NetworkVerdict classifies a network connection.
type NetworkVerdict string

const (
	VerdictSafe      NetworkVerdict = "SAFE"
	VerdictAIService NetworkVerdict = "AI_SERVICE"
	VerdictUnknown   NetworkVerdict = "UNKNOWN"
)

// NetworkEvent represents a detected network connection.
type NetworkEvent struct {
	DstDomain  string         `json:"dst_domain"`
	DstIP      string         `json:"dst_ip"`
	DstPort    int            `json:"dst_port"`
	Protocol   string         `json:"protocol"`
	Verdict    NetworkVerdict `json:"verdict"`
	DetectedAt time.Time      `json:"detected_at"`
}

// NetworkMonitor watches outbound network connections for AI service access.
type NetworkMonitor struct {
	cfg          *config.Config
	mu           sync.RWMutex
	lastEvents   []NetworkEvent
	domainMap    map[string]bool // Known AI domains
	seenConns    map[string]time.Time // Dedup: "ip:port" -> last seen
	dnsCache     map[string]string // IP -> Domain
	onDetection  func(NetworkEvent)
}

// NewNetworkMonitor creates a new network monitor.
func NewNetworkMonitor(cfg *config.Config, onDetection func(NetworkEvent)) *NetworkMonitor {
	nm := &NetworkMonitor{
		cfg:         cfg,
		seenConns:   make(map[string]time.Time),
		dnsCache:    make(map[string]string),
		onDetection: onDetection,
	}
	return nm
}

// buildDomainMap creates a lookup set of AI domains.
// The domain list is seeded from shared/detection_rules.json via the Config struct,
// with hardcoded defaults as fallback. Additional domains can be set via config JSON.
func buildDomainMap(cfg *config.Config) map[string]bool {
	m := make(map[string]bool)

	for _, domain := range cfg.AIDomains {
		m[strings.ToLower(domain)] = true
	}
	return m
}

// Scan checks all active network connections for AI service access.
func (nm *NetworkMonitor) Scan(ctx context.Context) ([]NetworkEvent, error) {
	nm.mu.Lock()
	nm.domainMap = buildDomainMap(nm.cfg)
	nm.mu.Unlock()

	connections, err := psnet.ConnectionsWithContext(ctx, "inet")
	if err != nil {
		return nil, fmt.Errorf("failed to get connections: %w", err)
	}

	var events []NetworkEvent
	var detected []NetworkEvent
	now := time.Now()

	for _, conn := range connections {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		// Skip listening sockets and local connections
		if conn.Status == "LISTEN" || conn.Raddr.IP == "" {
			continue
		}

		// Skip loopback
		if conn.Raddr.IP == "127.0.0.1" || conn.Raddr.IP == "::1" {
			continue
		}

		// Dedup: skip if we've seen this connection recently (within 30s)
		connKey := fmt.Sprintf("%s:%d", conn.Raddr.IP, conn.Raddr.Port)
		if lastSeen, exists := nm.seenConns[connKey]; exists {
			if now.Sub(lastSeen) < 30*time.Second {
				continue
			}
		}
		nm.seenConns[connKey] = now

		// Reverse DNS lookup to get domain
		domain := nm.reverseLookup(conn.Raddr.IP)

		// Classify the connection
		verdict := nm.classifyConnection(domain, conn.Raddr.IP, int(conn.Raddr.Port))

		protocol := "TCP"
		if conn.Type == 2 { // SOCK_DGRAM
			protocol = "UDP"
		}

		event := NetworkEvent{
			DstDomain:  domain,
			DstIP:      conn.Raddr.IP,
			DstPort:    int(conn.Raddr.Port),
			Protocol:   protocol,
			Verdict:    verdict,
			DetectedAt: now,
		}

		events = append(events, event)

		if verdict == VerdictAIService {
			detected = append(detected, event)
		}
	}

	// Update state
	nm.mu.Lock()
	nm.lastEvents = events
	nm.mu.Unlock()

	// Clean up old seen connections (older than 5 minutes)
	nm.cleanupSeenConns(now)

	// Fire callbacks
	if nm.onDetection != nil {
		for _, d := range detected {
			nm.onDetection(d)
		}
	}

	return events, nil
}

// updateDNSCache queries the OS DNS cache to map IPs to Domains.
// This defeats CDN/Cloudflare IP masking because the local machine resolves the real domain first.
// Supports: Windows (Get-DnsClientCache), macOS (log stream), Linux (journalctl).
func (nm *NetworkMonitor) updateDNSCache() {
	switch runtime.GOOS {
	case "windows":
		nm.updateDNSCacheWindows()
	case "darwin":
		nm.updateDNSCacheDarwin()
	case "linux":
		nm.updateDNSCacheLinux()
	}
}

// updateDNSCacheWindows uses PowerShell Get-DnsClientCache to extract cached DNS entries.
func (nm *NetworkMonitor) updateDNSCacheWindows() {
	cmd := exec.Command("powershell", "-NoProfile", "-Command", `Get-DnsClientCache | Select-Object Entry, Data | ConvertTo-Json`)
	out, err := cmd.Output()
	if err != nil {
		return
	}

	type DnsEntry struct {
		Entry string `json:"Entry"`
		Data  string `json:"Data"`
	}

	var entries []DnsEntry
	if err := json.Unmarshal(out, &entries); err != nil {
		// Sometimes PowerShell returns a single object instead of array if there's only 1 item
		var single DnsEntry
		if json.Unmarshal(out, &single) == nil {
			entries = append(entries, single)
		} else {
			return
		}
	}

	nm.mu.Lock()
	defer nm.mu.Unlock()
	for _, e := range entries {
		// Map IP (Data) to Domain (Entry)
		if e.Data != "" && e.Entry != "" {
			nm.dnsCache[e.Data] = e.Entry
		}
	}
}

// updateDNSCacheDarwin uses macOS `log stream` to capture recent DNS resolutions.
// macOS does not expose its DNS cache directly, so we parse mDNSResponder logs.
func (nm *NetworkMonitor) updateDNSCacheDarwin() {
	// Use `log show` to extract recent DNS resolutions from mDNSResponder (last 30 seconds)
	cmd := exec.Command("log", "show", "--predicate", `process == "mDNSResponder" AND message CONTAINS "A?"`, "--last", "30s", "--style", "compact")
	out, err := cmd.Output()
	if err != nil {
		// Fallback: try dscacheutil for basic lookups against known AI domains
		nm.probeKnownDomainsDarwin()
		return
	}

	nm.parseDNSLogEntries(string(out))
}

// probeKnownDomainsDarwin performs targeted DNS lookups for known AI domains on macOS.
// This is a fallback when log parsing is not available (e.g., SIP restrictions).
func (nm *NetworkMonitor) probeKnownDomainsDarwin() {
	nm.mu.RLock()
	domains := make([]string, 0, len(nm.domainMap))
	for d := range nm.domainMap {
		domains = append(domains, d)
	}
	nm.mu.RUnlock()

	for _, domain := range domains {
		ips, err := net.LookupHost(domain)
		if err != nil {
			continue
		}
		nm.mu.Lock()
		for _, ip := range ips {
			nm.dnsCache[ip] = domain
		}
		nm.mu.Unlock()
	}
}

// updateDNSCacheLinux tries systemd-resolved journal logs to extract DNS resolutions.
func (nm *NetworkMonitor) updateDNSCacheLinux() {
	// Try journalctl for systemd-resolved logs (most common on modern distros)
	cmd := exec.Command("journalctl", "-u", "systemd-resolved", "--since", "30s ago", "--no-pager", "-q")
	out, err := cmd.Output()
	if err != nil {
		// Fallback: probe known domains directly
		nm.probeKnownDomainsDarwin() // Same logic works for Linux
		return
	}

	nm.parseDNSLogEntries(string(out))
}

// parseDNSLogEntries extracts domain-to-IP mappings from raw DNS log text.
// Works with both macOS mDNSResponder and Linux systemd-resolved log formats.
func (nm *NetworkMonitor) parseDNSLogEntries(logText string) {
	lines := strings.Split(logText, "\n")
	nm.mu.Lock()
	defer nm.mu.Unlock()

	for _, line := range lines {
		lower := strings.ToLower(line)
		// Look for known AI domains mentioned in log lines
		for domain := range nm.domainMap {
			if strings.Contains(lower, domain) {
				// Try to extract an IP from the same line (common log patterns: "1.2.3.4" or "-> 1.2.3.4")
				words := strings.Fields(line)
				for _, w := range words {
					cleaned := strings.Trim(w, "[](),:;")
					ip := net.ParseIP(cleaned)
					if ip != nil && !ip.IsLoopback() {
						nm.dnsCache[cleaned] = domain
					}
				}
			}
		}
	}
}

// reverseLookup attempts to resolve an IP to a domain name using local cache then net.LookupAddr.
func (nm *NetworkMonitor) reverseLookup(ip string) string {
	nm.mu.RLock()
	cachedDomain, exists := nm.dnsCache[ip]
	nm.mu.RUnlock()

	if exists {
		return cachedDomain
	}

	names, err := net.LookupAddr(ip)
	if err != nil || len(names) == 0 {
		return ""
	}
	// Remove trailing dot from DNS name
	return strings.TrimSuffix(names[0], ".")
}

// classifyConnection determines if a connection is to an AI service.
func (nm *NetworkMonitor) classifyConnection(domain, ip string, port int) NetworkVerdict {
	lowerDomain := strings.ToLower(domain)

	// Direct domain match
	if nm.domainMap[lowerDomain] {
		return VerdictAIService
	}

	// Partial domain match (subdomain check)
	for aiDomain := range nm.domainMap {
		if strings.HasSuffix(lowerDomain, "."+aiDomain) || lowerDomain == aiDomain {
			return VerdictAIService
		}
	}

	// ── Private IP + Known AI Port Detection ──
	// If the connection is to a private/internal IP on a known AI port,
	// it likely means the contestant is running an AI runtime on another
	// machine in the network, inside a VM, or via port forwarding.
	if isPrivateIP(ip) {
		for _, ap := range knownAIPorts {
			if port == ap.Port {
				return VerdictAIService
			}
		}
	}

	// HTTPS connections to unknown domains are flagged as UNKNOWN
	if port == 443 && domain == "" {
		return VerdictUnknown
	}

	return VerdictSafe
}

// isPrivateIP checks if an IP address is in a private/reserved range.
func isPrivateIP(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}

	// RFC 1918 private ranges
	privateRanges := []struct {
		network string
		mask    int
	}{
		{"10.0.0.0", 8},
		{"172.16.0.0", 12},
		{"192.168.0.0", 16},
	}

	for _, r := range privateRanges {
		_, cidr, err := net.ParseCIDR(fmt.Sprintf("%s/%d", r.network, r.mask))
		if err != nil {
			continue
		}
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

// cleanupSeenConns removes entries older than 5 minutes.
func (nm *NetworkMonitor) cleanupSeenConns(now time.Time) {
	nm.mu.Lock()
	defer nm.mu.Unlock()
	for key, lastSeen := range nm.seenConns {
		if now.Sub(lastSeen) > 5*time.Minute {
			delete(nm.seenConns, key)
		}
	}
}

// Run starts the continuous network monitoring loop.
func (nm *NetworkMonitor) Run(ctx context.Context) {
	log.Println("[NetworkMonitor] Starting network scanning...")
	ticker := time.NewTicker(nm.cfg.NetworkScanInterval)
	defer ticker.Stop()

	// Initial DNS cache update
	go nm.updateDNSCache()

	// Periodic DNS cache updater (every 15 seconds)
	go func() {
		dnsTicker := time.NewTicker(15 * time.Second)
		defer dnsTicker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-dnsTicker.C:
				nm.updateDNSCache()
			}
		}
	}()

	// Initial scan
	if _, err := nm.Scan(ctx); err != nil {
		log.Printf("[NetworkMonitor] Initial scan error: %v", err)
	}

	for {
		select {
		case <-ctx.Done():
			log.Println("[NetworkMonitor] Stopping.")
			return
		case <-ticker.C:
			if _, err := nm.Scan(ctx); err != nil {
				log.Printf("[NetworkMonitor] Scan error: %v", err)
			}
		}
	}
}

// GetLastEvents returns the most recent network events.
func (nm *NetworkMonitor) GetLastEvents() []NetworkEvent {
	nm.mu.RLock()
	defer nm.mu.RUnlock()
	result := make([]NetworkEvent, len(nm.lastEvents))
	copy(result, nm.lastEvents)
	return result
}

// GetDetectedAI returns only AI_SERVICE network events.
func (nm *NetworkMonitor) GetDetectedAI() []NetworkEvent {
	nm.mu.RLock()
	defer nm.mu.RUnlock()

	var result []NetworkEvent
	for _, e := range nm.lastEvents {
		if e.Verdict == VerdictAIService {
			result = append(result, e)
		}
	}
	return result
}
