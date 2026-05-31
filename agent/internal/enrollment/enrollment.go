// Package enrollment handles the agent registration flow with the VOIGHT server.
// The agent presents an enrollment token and receives its configuration and identity.
package enrollment

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	psnet "github.com/shirou/gopsutil/v3/net"

	"github.com/lockon/voight-agent/internal/config"
	"github.com/lockon/voight-agent/internal/sysutil"
)

// MachineFingerprint contains hardware identification of the contestant's machine.
type MachineFingerprint struct {
	Hostname   string `json:"hostname"`
	IPAddress  string `json:"ip_address"`
	OS         string `json:"os"`
	OSVersion  string `json:"os_version"`
	CPUModel   string `json:"cpu_model"`
	CPUCores   int    `json:"cpu_cores"`
	TotalRAMGB int    `json:"total_ram_gb"`
	GPUName    string `json:"gpu_name"`
	GPUVRAMGB  int    `json:"gpu_vram_gb"`
	MACAddress string `json:"mac_address"`
}

// EnrollmentResult contains the response from a successful enrollment.
type EnrollmentResult struct {
	AgentID       string `json:"agent_id"`
	ContestantID  string `json:"contestant_id"`
	CompetitionID string `json:"competition_id"`
	Config        *config.Config `json:"config"`
}

// EnrollFunc is the function signature for the gRPC enrollment call.
type EnrollFunc func(ctx context.Context, token string, fp MachineFingerprint, agentVersion, binaryHash string) (*EnrollmentResult, error)

// Manager handles the enrollment process.
type Manager struct {
	cfg        *config.Config
	enrollFn   EnrollFunc
	enrolled   bool
	result     *EnrollmentResult
}

// NewManager creates a new enrollment manager.
func NewManager(cfg *config.Config, enrollFn EnrollFunc) *Manager {
	return &Manager{
		cfg:      cfg,
		enrollFn: enrollFn,
	}
}

// Enroll registers the agent with the server.
func (m *Manager) Enroll(ctx context.Context, binaryHash string) (*EnrollmentResult, error) {
	if m.cfg.CompetitionKey == "" {
		return nil, fmt.Errorf("competition key is required")
	}

	log.Println("[Enrollment] Gathering machine fingerprint...")
	fp, err := GatherFingerprint()
	if err != nil {
		return nil, fmt.Errorf("failed to gather fingerprint: %w", err)
	}

	log.Printf("[Enrollment] Machine: %s (%s %s, %d cores, %d GB RAM)",
		fp.Hostname, fp.OS, fp.CPUModel, fp.CPUCores, fp.TotalRAMGB)

	log.Println("[Enrollment] Sending enrollment request...")
	// Note: The actual payload is now constructed in main.go
	// But the interface takes the token. We pass empty string, main.go ignores it anyway,
	// or we pass CompetitionKey to satisfy the signature.
	token := m.cfg.CompetitionKey
	if m.cfg.TeamName != "" {
		token = token + "::" + m.cfg.TeamName
	}
	if m.cfg.ContestantName != "" {
		token = token + "::" + m.cfg.ContestantName
	}
	result, err := m.enrollFn(ctx, token, fp, "2.1.4", binaryHash)
	if err != nil {
		return nil, fmt.Errorf("enrollment failed: %w", err)
	}

	// Update config with received identity
	m.cfg.AgentID = result.AgentID
	m.cfg.ContestantID = result.ContestantID
	m.cfg.CompetitionID = result.CompetitionID

	m.enrolled = true
	m.result = result

	log.Printf("[Enrollment] Enrolled successfully!")
	log.Printf("[Enrollment] Agent ID: %s", result.AgentID)
	log.Printf("[Enrollment] Contestant ID: %s", result.ContestantID)
	log.Printf("[Enrollment] Competition ID: %s", result.CompetitionID)

	return result, nil
}

// IsEnrolled returns whether the agent has successfully enrolled.
func (m *Manager) IsEnrolled() bool {
	return m.enrolled
}

// GatherFingerprint collects machine hardware information.
func GatherFingerprint() (MachineFingerprint, error) {
	fp := MachineFingerprint{
		OS: runtime.GOOS,
	}

	// Hostname
	hostname, err := os.Hostname()
	if err == nil {
		fp.Hostname = hostname
	}

	// OS version
	hostInfo, err := host.Info()
	if err == nil {
		fp.OSVersion = hostInfo.PlatformVersion
	}

	// CPU model & cores
	cpuInfo, err := cpu.Info()
	if err == nil && len(cpuInfo) > 0 {
		fp.CPUModel = cpuInfo[0].ModelName
	} else {
		fp.CPUModel = runtime.GOARCH
	}
	cpuCores, err := cpu.Counts(true)
	if err == nil {
		fp.CPUCores = cpuCores
	}

	// Total RAM in GB
	vmem, err := mem.VirtualMemory()
	if err == nil {
		fp.TotalRAMGB = int(vmem.Total / (1024 * 1024 * 1024))
	}

	// IP address (outbound)
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err == nil {
		localAddr := conn.LocalAddr().(*net.UDPAddr)
		fp.IPAddress = localAddr.IP.String()
		conn.Close()
	}

	// MAC address (primary interface)
	interfaces, err := psnet.Interfaces()
	if err == nil {
		for _, iface := range interfaces {
			// Skip loopback and virtual interfaces
			if strings.Contains(strings.ToLower(iface.Name), "loopback") || strings.Contains(strings.ToLower(iface.Name), "docker") || strings.Contains(strings.ToLower(iface.Name), "veth") {
				continue
			}
			if iface.HardwareAddr != "" {
				fp.MACAddress = iface.HardwareAddr
				break
			}
		}
	}

	// GPU info (best effort via nvidia-smi)
	gpuName, gpuVramMB := getGPUInfo()
	fp.GPUName = gpuName
	if gpuVramMB > 0 {
		fp.GPUVRAMGB = int(gpuVramMB / 1024)
	}

	return fp, nil
}

// getGPUInfo attempts to get GPU name and VRAM from nvidia-smi.
func getGPUInfo() (string, int64) {
	// This is a simplified version — nvidia-smi parsing is in resource monitor
	// Here we just get the GPU name and total VRAM for fingerprinting
	cmd := exec.Command("nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits")
	sysutil.HideConsoleWindow(cmd)
	output, err := cmd.Output()
	if err != nil {
		return "", 0
	}

	parts := strings.Split(strings.TrimSpace(string(output)), ",")
	if len(parts) >= 2 {
		name := strings.TrimSpace(parts[0])
		vramStr := strings.TrimSpace(parts[1])
		vram, _ := strconv.ParseInt(vramStr, 10, 64)
		return name, vram
	}

	return "", 0
}
