//go:build !linux || !ebpf

// ebpf_other.go provides a no-op eBPF monitor stub for non-Linux platforms.
// eBPF is a Linux-specific kernel feature. Windows and macOS agents continue
// using user-space process and network monitoring.

package ebpf

import (
	"context"
	"log"

	"github.com/lockon/voight-agent/internal/config"
)

// EBPFMonitor is a no-op on non-Linux platforms.
type EBPFMonitor struct{}

// New creates a no-op eBPF monitor on non-Linux platforms.
func New(cfg *config.Config, onExec ExecCallback, onConnect ConnectCallback, onOpen OpenCallback) *EBPFMonitor {
	return &EBPFMonitor{}
}

// IsAvailable always returns false on non-Linux platforms.
func (m *EBPFMonitor) IsAvailable() bool {
	return false
}

// Run is a no-op on non-Linux platforms.
func (m *EBPFMonitor) Run(ctx context.Context) {
	log.Println("[eBPF] Kernel-level monitoring not available on this platform (Linux only).")
}
