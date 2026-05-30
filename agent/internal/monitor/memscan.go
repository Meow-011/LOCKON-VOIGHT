// Package monitor provides system monitoring capabilities for the VOIGHT Agent.
//
// memscan.go defines the cross-platform interface and types for memory forensics.
// The actual scanning is implemented in memscan_linux.go (active) and memscan_other.go (no-op stub).
package monitor

import (
	"time"

	"github.com/lockon/voight-agent/internal/config"
)

// MemoryFinding represents a detected AI model signature in process memory.
type MemoryFinding struct {
	PID         int32     `json:"pid"`
	ProcessName string    `json:"process_name"`
	ModelFormat string    `json:"model_format"`  // "GGUF", "GGML", "SAFETENSORS", "PYTORCH", "ONNX"
	RegionAddr  uint64    `json:"region_addr"`   // Virtual address of the matched region
	RegionSize  uint64    `json:"region_size"`   // Size of the mapped region in bytes
	DetectedAt  time.Time `json:"detected_at"`
}

// ModelSignature defines a magic byte pattern used to identify AI model formats in memory.
type ModelSignature struct {
	Name   string // Human-readable format name
	Magic  []byte // Magic byte sequence to search for
	Offset int    // Expected offset from region start (0 = start)
}

// KnownModelSignatures contains the magic byte patterns for known AI model formats.
// These are searched for in process memory regions to detect loaded LLM models.
var KnownModelSignatures = []ModelSignature{
	{
		Name:  "GGUF",
		Magic: []byte{0x47, 0x47, 0x55, 0x46}, // "GGUF" — GGUF v3 header magic
	},
	{
		Name:  "GGML",
		Magic: []byte{0x67, 0x6A, 0x61, 0x6D}, // "gjam" — GGML legacy header
	},
	{
		Name:  "SAFETENSORS",
		Magic: []byte{0x7B, 0x22}, // '{"' — SafeTensors JSON header start
		// Additional validation: must contain "__metadata__" or "dtype" nearby
	},
	{
		Name:  "PYTORCH",
		Magic: []byte{0x80, 0x02}, // Python pickle protocol 2 (used by torch.save)
	},
	{
		Name:  "ONNX",
		Magic: []byte{0x08, 0x06, 0x12}, // ONNX protobuf header (ir_version=6)
	},
}

// MemoryScannerConfig holds configuration for the memory scanner.
type MemoryScannerConfig struct {
	// MinRSSMB is the minimum RSS (Resident Set Size) in MB for a process to be scanned.
	// Processes using less memory than this cannot possibly hold an LLM model.
	MinRSSMB int64

	// ScanIntervalSeconds is the interval between periodic memory sweeps.
	ScanIntervalSeconds int

	// MaxProcessesPerScan limits how many processes are scanned per cycle to control CPU usage.
	MaxProcessesPerScan int

	// MaxRegionSizeMB limits the size of individual memory regions to scan (skip huge mappings).
	MaxRegionSizeMB int64
}

// DefaultMemScanConfig returns sensible defaults for the memory scanner.
func DefaultMemScanConfig() MemoryScannerConfig {
	return MemoryScannerConfig{
		MinRSSMB:            500,  // Only scan processes using >500MB RAM
		ScanIntervalSeconds: 30,   // Periodic sweep every 30 seconds
		MaxProcessesPerScan: 20,   // Scan at most 20 processes per cycle
		MaxRegionSizeMB:     8192, // Skip regions larger than 8GB
	}
}

// MemoryScanner scans process memory for AI model tensor signatures.
// Platform-specific implementations are in memscan_linux.go and memscan_other.go.
type MemoryScanner struct {
	cfg         *config.Config
	scanCfg     MemoryScannerConfig
	onDetection func(MemoryFinding)
}

// NewMemoryScanner creates a new memory scanner.
// The onDetection callback is invoked for each AI model signature found in process memory.
func NewMemoryScanner(cfg *config.Config, onDetection func(MemoryFinding)) *MemoryScanner {
	return &MemoryScanner{
		cfg:         cfg,
		scanCfg:     DefaultMemScanConfig(),
		onDetection: onDetection,
	}
}
