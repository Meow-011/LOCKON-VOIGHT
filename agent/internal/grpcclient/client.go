// Package grpcclient provides the gRPC client for communicating with the VOIGHT server.
// It handles telemetry streaming, heartbeats, and enrollment via gRPC + mTLS.
package grpcclient

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/keepalive"

	"github.com/lockon/voight-agent/internal/config"
	"github.com/lockon/voight-agent/internal/enrollment"
	"github.com/lockon/voight-agent/internal/monitor"
	pb "github.com/lockon/voight-agent/proto/voight"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Client wraps the gRPC connection and provides high-level methods
// for communicating with the VOIGHT server.
type Client struct {
	cfg      *config.Config
	conn     *grpc.ClientConn
	mu       sync.RWMutex
	connected bool
}

// NewClient creates a new gRPC client.
func NewClient(cfg *config.Config) *Client {
	return &Client{
		cfg: cfg,
	}
}

// Connect establishes the gRPC connection to the server.
func (c *Client) Connect(ctx context.Context) error {
	var opts []grpc.DialOption

	if c.cfg.UseTLS {
		tlsCreds, err := c.loadTLSCredentials()
		if err != nil {
			return fmt.Errorf("failed to load TLS credentials: %w", err)
		}
		opts = append(opts, grpc.WithTransportCredentials(tlsCreds))
	} else {
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	// Keep-alive settings
	opts = append(opts, grpc.WithKeepaliveParams(keepalive.ClientParameters{
		Time:                10 * time.Second,
		Timeout:             5 * time.Second,
		PermitWithoutStream: true,
	}))

	address := c.cfg.GRPCAddress()
	log.Printf("[gRPC] Connecting to %s...", address)

	conn, err := grpc.DialContext(ctx, address, opts...)
	if err != nil {
		return fmt.Errorf("failed to connect to gRPC server: %w", err)
	}

	c.mu.Lock()
	c.conn = conn
	c.connected = true
	c.mu.Unlock()

	log.Printf("[gRPC] Connected to %s.", address)
	return nil
}

// loadTLSCredentials creates mTLS transport credentials.
func (c *Client) loadTLSCredentials() (credentials.TransportCredentials, error) {
	// Load CA certificate
	caCert, err := os.ReadFile(c.cfg.CACertPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read CA cert: %w", err)
	}

	certPool := x509.NewCertPool()
	if !certPool.AppendCertsFromPEM(caCert) {
		return nil, fmt.Errorf("failed to parse CA cert")
	}

	// Load agent client certificate and key (for mTLS)
	agentCert, err := tls.LoadX509KeyPair(c.cfg.AgentCertPath, c.cfg.AgentKeyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load agent cert/key: %w", err)
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{agentCert},
		RootCAs:      certPool,
		MinVersion:   tls.VersionTLS13,
	}

	return credentials.NewTLS(tlsConfig), nil
}

// Close shuts down the gRPC connection.
func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn != nil {
		c.connected = false
		return c.conn.Close()
	}
	return nil
}

// IsConnected returns whether the client has an active connection.
func (c *Client) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.connected
}

// GetConnection returns the underlying gRPC connection for direct stub usage.
func (c *Client) GetConnection() *grpc.ClientConn {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.conn
}

// ─── High-Level Methods ──────────────────────────────────────────

// SendHeartbeat sends a heartbeat to the server and returns the suggested interval and whether a warning payload was triggered.
func (c *Client) SendHeartbeat(ctx context.Context, agentID, contestantID, version, binaryHash string) (int, bool, *pb.AgentConfig, error) {
	if c.conn == nil {
		return 0, false, nil, fmt.Errorf("gRPC connection not established")
	}

	client := pb.NewTelemetryServiceClient(c.conn)
	resp, err := client.Heartbeat(ctx, &pb.HeartbeatRequest{
		AgentId:         agentID,
		ContestantId:    contestantID,
		AgentVersion:    version,
		AgentBinaryHash: binaryHash,
		Timestamp:       timestamppb.Now(),
	})
	
	if err != nil {
		return 0, false, nil, fmt.Errorf("heartbeat failed: %w", err)
	}

	// Only log warnings to avoid spamming the console and confusing users
	if resp.DeployWarningPayload {
		log.Printf("[Heartbeat] SERVER WARNING: Agent policy violation detected!")
	}
	// For normal successful heartbeats, we can either stay silent or log a simple 'OK'
	// Silent is usually better for a background heartbeat every 10s.
	return int(resp.HeartbeatIntervalSeconds), resp.DeployWarningPayload, resp.ConfigUpdate, nil
}

// sendTelemetryReport is a helper to stream a single report and close the stream.
func (c *Client) sendTelemetryReport(ctx context.Context, report *pb.TelemetryReport) error {
	if c.conn == nil {
		return fmt.Errorf("gRPC connection not established")
	}
	client := pb.NewTelemetryServiceClient(c.conn)
	stream, err := client.StreamTelemetry(ctx)
	if err != nil {
		return err
	}
	if err := stream.Send(report); err != nil {
		return err
	}
	_, err = stream.CloseAndRecv()
	return err
}

// SendProcessSnapshot sends process monitoring data to the server.
func (c *Client) SendProcessSnapshot(ctx context.Context, contestantID string, processes []monitor.ProcessInfo) error {
	var pbProcs []*pb.ProcessInfo
	for _, p := range processes {
		pbProcs = append(pbProcs, &pb.ProcessInfo{
			Name:       p.Name,
			Pid:        int32(p.PID),
			Cmdline:    p.Cmdline,
			CpuPercent: float32(p.CPUPercent),
			MemoryMb:   float32(p.MemoryMB),
			Category:   string(p.Category),
		})
	}
	
	report := &pb.TelemetryReport{
		AgentId:      c.cfg.AgentID,
		ContestantId: contestantID,
		Timestamp:    timestamppb.Now(),
		Payload: &pb.TelemetryReport_ProcessSnapshot{
			ProcessSnapshot: &pb.ProcessSnapshot{
				Processes: pbProcs,
			},
		},
	}
	
	if err := c.sendTelemetryReport(ctx, report); err != nil {
		return err
	}
	log.Printf("[gRPC] Sent process snapshot (%d processes)", len(processes))
	return nil
}

// SendNetworkEvent sends a network detection event to the server.
func (c *Client) SendNetworkEvent(ctx context.Context, contestantID string, event monitor.NetworkEvent) error {
	report := &pb.TelemetryReport{
		AgentId:      c.cfg.AgentID,
		ContestantId: contestantID,
		Timestamp:    timestamppb.Now(),
		Payload: &pb.TelemetryReport_NetworkEvent{
			NetworkEvent: &pb.NetworkEvent{
				DstDomain: event.DstDomain,
				DstIp:     event.DstIP,
				DstPort:   int32(event.DstPort),
				Protocol:  event.Protocol,
				Verdict:   string(event.Verdict),
			},
		},
	}
	if err := c.sendTelemetryReport(ctx, report); err != nil {
		return err
	}
	log.Printf("[gRPC] Sent network event: %s → %s (%s)", event.DstIP, event.DstDomain, event.Verdict)
	return nil
}

// SendResourceSnapshot sends resource usage data to the server.
func (c *Client) SendResourceSnapshot(ctx context.Context, contestantID string, snapshot monitor.ResourceSnapshot) error {
	report := &pb.TelemetryReport{
		AgentId:      c.cfg.AgentID,
		ContestantId: contestantID,
		Timestamp:    timestamppb.Now(),
		Payload: &pb.TelemetryReport_ResourceSnapshot{
			ResourceSnapshot: &pb.ResourceSnapshot{
				CpuPercent: float32(snapshot.CPUPercent),
				RamPercent: float32(snapshot.RAMPercent),
				GpuPercent: float32(snapshot.GPUPercent),
				VramMb:     float32(snapshot.VRAMMB),
			},
		},
	}
	if err := c.sendTelemetryReport(ctx, report); err != nil {
		return err
	}
	log.Printf("[gRPC] Sent resource snapshot (CPU: %.1f%%, GPU: %.1f%%)", snapshot.CPUPercent, snapshot.GPUPercent)
	return nil
}

// SendFileAlert sends a file detection alert to the server.
func (c *Client) SendFileAlert(ctx context.Context, contestantID string, alert monitor.FileAlert) error {
	report := &pb.TelemetryReport{
		AgentId:      c.cfg.AgentID,
		ContestantId: contestantID,
		Timestamp:    timestamppb.Now(),
		Payload: &pb.TelemetryReport_FileAlert{
			FileAlert: &pb.FileAlert{
				FilePath:      alert.FilePath,
				FileName:      alert.FileName,
				FileSizeBytes: alert.FileSizeBytes,
				FileType:      alert.FileType,
				HashSha256:    "", // Not currently computed locally
			},
		},
	}
	if err := c.sendTelemetryReport(ctx, report); err != nil {
		return err
	}
	log.Printf("[gRPC] Sent file alert: %s (%.1f MB, %s)", alert.FileName, alert.FileSizeMB, alert.FileType)
	return nil
}

// SendMemoryFinding sends a memory forensics finding to the server.
func (c *Client) SendMemoryFinding(ctx context.Context, contestantID string, finding monitor.MemoryFinding) error {
	report := &pb.TelemetryReport{
		AgentId:      c.cfg.AgentID,
		ContestantId: contestantID,
		Timestamp:    timestamppb.Now(),
		Payload: &pb.TelemetryReport_MemoryFinding{
			MemoryFinding: &pb.MemoryFinding{
				Pid:         finding.PID,
				ProcessName: finding.ProcessName,
				ModelFormat: finding.ModelFormat,
				RegionAddr:  finding.RegionAddr,
				RegionSize:  finding.RegionSize,
			},
		},
	}
	if err := c.sendTelemetryReport(ctx, report); err != nil {
		return err
	}
	log.Printf("[gRPC] Sent memory finding: %s tensor in PID %d (%s)", finding.ModelFormat, finding.PID, finding.ProcessName)
	return nil
}

// SendEbpfAlert sends an eBPF kernel event alert to the server.
func (c *Client) SendEbpfAlert(ctx context.Context, contestantID string, eventType, processName string, pid int32, detail, category string) error {
	report := &pb.TelemetryReport{
		AgentId:      c.cfg.AgentID,
		ContestantId: contestantID,
		Timestamp:    timestamppb.Now(),
		Payload: &pb.TelemetryReport_EbpfAlert{
			EbpfAlert: &pb.EbpfAlert{
				EventType:   eventType,
				Pid:         pid,
				ProcessName: processName,
				Detail:      detail,
				Category:    category,
			},
		},
	}
	if err := c.sendTelemetryReport(ctx, report); err != nil {
		return err
	}
	log.Printf("[gRPC] Sent eBPF alert: %s %s (PID %d, category: %s)", eventType, processName, pid, category)
	return nil
}

// SendHelpRequest sends a manual help request to the proctor.
func (c *Client) SendHelpRequest(ctx context.Context, contestantID string) error {
	if c.conn == nil {
		return fmt.Errorf("gRPC connection not established")
	}
	client := pb.NewTelemetryServiceClient(c.conn)
	
	req := &pb.HelpRequest{
		AgentId:      c.cfg.AgentID,
		ContestantId: contestantID,
		Timestamp:    timestamppb.Now(),
	}
	
	resp, err := client.RequestHelp(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to send help request: %w", err)
	}
	if !resp.Acknowledged {
		return fmt.Errorf("server rejected help request")
	}
	log.Println("[gRPC] Sent Help Request successfully.")
	return nil
}

// SendDisconnect sends an intentional disconnect signal to the server.
func (c *Client) SendDisconnect(ctx context.Context, contestantID string) error {
	if c.conn == nil {
		return fmt.Errorf("gRPC connection not established")
	}
	client := pb.NewTelemetryServiceClient(c.conn)
	
	req := &pb.DisconnectRequest{
		AgentId:      c.cfg.AgentID,
		ContestantId: contestantID,
		Timestamp:    timestamppb.Now(),
	}
	
	resp, err := client.Disconnect(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to send disconnect request: %w", err)
	}
	if !resp.Acknowledged {
		return fmt.Errorf("server rejected disconnect request")
	}
	log.Println("[gRPC] Sent Disconnect signal successfully.")
	return nil
}

// Enroll sends an enrollment request to the server.
func (c *Client) Enroll(ctx context.Context, token string, fingerprint interface{}, agentVersion, binaryHash string) (interface{}, error) {
	if c.conn == nil {
		return nil, fmt.Errorf("gRPC connection not established")
	}

	client := pb.NewEnrollmentServiceClient(c.conn)
	
	var pbFingerprint *pb.MachineFingerprint
	if fp, ok := fingerprint.(enrollment.MachineFingerprint); ok {
		pbFingerprint = &pb.MachineFingerprint{
			Hostname:     fp.Hostname + " (IP: " + fp.IPAddress + ")",
			Os:           fp.OS,
			OsVersion:    fp.OSVersion,
			Architecture: fp.CPUModel, // Storing CPU model in Architecture field
			CpuCores:     int32(fp.CPUCores),
			TotalRamMb:   int64(fp.TotalRAMGB), // Sending GB in the MB field temporarily
			GpuName:      fp.GPUName,
			GpuVramMb:    int64(fp.GPUVRAMGB), // Sending GB in the MB field temporarily
			MacAddress:   fp.MACAddress,
		}
	}

	resp, err := client.Enroll(ctx, &pb.EnrollmentRequest{
		EnrollmentToken: token,
		Fingerprint:     pbFingerprint,
		AgentVersion:    agentVersion,
		AgentBinaryHash: binaryHash,
	})

	if err != nil {
		return nil, fmt.Errorf("enrollment failed: %w", err)
	}

	log.Printf("[gRPC] Enrollment successful for contestant: %s", resp.ContestantId)
	return resp, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
