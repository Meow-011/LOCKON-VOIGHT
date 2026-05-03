package monitor

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/lockon/voight-agent/internal/config"
)

// FileAlert represents a detected suspicious file.
type FileAlert struct {
	FilePath      string    `json:"file_path"`
	FileName      string    `json:"file_name"`
	FileSizeBytes int64     `json:"file_size_bytes"`
	FileSizeMB    float64   `json:"file_size_mb"`
	FileType      string    `json:"file_type"`
	DetectedAt    time.Time `json:"detected_at"`
}

// FileScanner searches for known LLM model file signatures on the filesystem.
type FileScanner struct {
	cfg         *config.Config
	mu          sync.RWMutex
	lastAlerts  []FileAlert
	extensions  map[string]string // ".gguf" -> "GGUF"
	onDetection func(FileAlert)
}

// NewFileScanner creates a new file scanner.
func NewFileScanner(cfg *config.Config, onDetection func(FileAlert)) *FileScanner {
	extMap := map[string]string{
		".gguf":        "GGUF",
		".safetensors": "SAFETENSORS",
		".ggml":        "GGML",
		".bin":         "BIN",
		".pth":         "PTH",
		".onnx":        "ONNX",
	}

	// Add custom extensions from config
	for _, ext := range cfg.ModelFileExtensions {
		if !strings.HasPrefix(ext, ".") {
			ext = "." + ext
		}
		extMap[strings.ToLower(ext)] = strings.ToUpper(strings.TrimPrefix(ext, "."))
	}

	return &FileScanner{
		cfg:         cfg,
		extensions:  extMap,
		onDetection: onDetection,
	}
}

// Scan searches configured paths for suspicious model files.
func (fs *FileScanner) Scan(ctx context.Context) ([]FileAlert, error) {
	paths := fs.getScanPaths()
	if len(paths) == 0 {
		return nil, nil
	}

	var alerts []FileAlert
	var mu sync.Mutex

	for _, basePath := range paths {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		err := filepath.WalkDir(basePath, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil // Skip inaccessible paths
			}

			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
			}

			// Skip directories
			if d.IsDir() {
				// Skip common system/irrelevant directories
				name := strings.ToLower(d.Name())
				skipDirs := []string{
					"windows", "system32", "program files", "node_modules",
					".git", "__pycache__", "appdata",
				}
				for _, skip := range skipDirs {
					if name == skip {
						return filepath.SkipDir
					}
				}
				return nil
			}

			// Check file extension
			ext := strings.ToLower(filepath.Ext(path))
			fileType, isTarget := fs.extensions[ext]
			if !isTarget {
				return nil
			}

			// Get file info for size check
			info, err := d.Info()
			if err != nil {
				return nil
			}

			sizeMB := float64(info.Size()) / (1024 * 1024)
			minSizeMB := float64(fs.cfg.ModelFileSizeMinMB)

			// .bin and .pth files need to be large to be suspicious
			// Other model-specific extensions are always suspicious
			if ext == ".bin" || ext == ".pth" {
				if sizeMB < minSizeMB {
					return nil // Too small to be a model
				}
			}

			alert := FileAlert{
				FilePath:      path,
				FileName:      d.Name(),
				FileSizeBytes: info.Size(),
				FileSizeMB:    sizeMB,
				FileType:      fileType,
				DetectedAt:    time.Now(),
			}

			mu.Lock()
			alerts = append(alerts, alert)
			mu.Unlock()

			return nil
		})

		if err != nil && err != context.Canceled {
			log.Printf("[FileScanner] Error scanning %s: %v", basePath, err)
		}
	}

	// Update state
	fs.mu.Lock()
	fs.lastAlerts = alerts
	fs.mu.Unlock()

	// Fire callbacks
	if fs.onDetection != nil {
		for _, a := range alerts {
			fs.onDetection(a)
		}
	}

	return alerts, nil
}

// getScanPaths returns the list of paths to scan, with platform defaults.
func (fs *FileScanner) getScanPaths() []string {
	if len(fs.cfg.FileScanPaths) > 0 {
		return fs.cfg.FileScanPaths
	}

	// Default scan paths
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}

	paths := []string{
		home,
	}

	// Add common model storage locations
	commonPaths := []string{
		filepath.Join(home, ".ollama", "models"),
		filepath.Join(home, ".cache", "huggingface"),
		filepath.Join(home, ".cache", "lm-studio"),
		filepath.Join(home, "Downloads"),
		filepath.Join(home, "Desktop"),
		filepath.Join(home, "Documents"),
	}

	for _, p := range commonPaths {
		if _, err := os.Stat(p); err == nil {
			paths = append(paths, p)
		}
	}

	return paths
}

// ScanOnce performs a single scan (used for initial check at startup).
func (fs *FileScanner) ScanOnce(ctx context.Context) {
	log.Println("[FileScanner] Starting initial file scan...")
	start := time.Now()

	alerts, err := fs.Scan(ctx)
	if err != nil {
		log.Printf("[FileScanner] Scan error: %v", err)
		return
	}

	duration := time.Since(start)
	log.Printf("[FileScanner] Scan completed in %v — found %d suspicious files.", duration, len(alerts))

	for _, a := range alerts {
		log.Printf("[FileScanner] Found: %s (%.1f MB, type: %s)", a.FilePath, a.FileSizeMB, a.FileType)
	}
}

// GetLastAlerts returns the most recent file scan alerts.
func (fs *FileScanner) GetLastAlerts() []FileAlert {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	result := make([]FileAlert, len(fs.lastAlerts))
	copy(result, fs.lastAlerts)
	return result
}

// Ensure fmt is used
var _ = fmt.Sprintf
