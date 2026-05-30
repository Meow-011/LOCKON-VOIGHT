//go:build !linux

// memscan_other.go provides a no-op memory scanner stub for non-Linux platforms.
// Memory forensics via /proc/<pid>/mem is Linux-specific.
// Windows and macOS agents continue using user-space process/file monitoring.

package monitor

import (
	"context"
	"log"
)

// Scan is a no-op on non-Linux platforms. Returns empty results.
func (ms *MemoryScanner) Scan(ctx context.Context) ([]MemoryFinding, error) {
	return nil, nil
}

// Run is a no-op on non-Linux platforms.
func (ms *MemoryScanner) Run(ctx context.Context) {
	log.Println("[MemScan] Memory forensics not available on this platform (Linux only).")
}

// ScanProcess is a no-op on non-Linux platforms.
func (ms *MemoryScanner) ScanProcess(ctx context.Context, pid int32) ([]MemoryFinding, error) {
	return nil, nil
}

// IsAvailable returns false on non-Linux platforms.
func (ms *MemoryScanner) IsAvailable() bool {
	return false
}
