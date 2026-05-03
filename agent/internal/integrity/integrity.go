// Package integrity implements self-verification mechanisms for the VOIGHT Agent.
// It computes and periodically verifies the SHA-256 hash of the running binary
// to detect tampering attempts by contestants.
package integrity

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"log"
	"os"
	"sync"
	"time"
)

// Checker verifies the integrity of the agent binary.
type Checker struct {
	mu           sync.RWMutex
	binaryPath   string
	startupHash  string
	currentHash  string
	lastChecked  time.Time
	tampered     bool
	onTamper     func(expected, actual string)
}

// NewChecker creates a new integrity checker.
// It immediately computes the hash of the running binary.
func NewChecker(onTamper func(expected, actual string)) (*Checker, error) {
	binaryPath, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("failed to get executable path: %w", err)
	}

	hash, err := computeFileHash(binaryPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compute binary hash: %w", err)
	}

	log.Printf("[Integrity] Binary path: %s", binaryPath)
	log.Printf("[Integrity] SHA-256: %s", hash)

	return &Checker{
		binaryPath:  binaryPath,
		startupHash: hash,
		currentHash: hash,
		lastChecked: time.Now(),
		onTamper:    onTamper,
	}, nil
}

// computeFileHash computes the SHA-256 hash of a file.
func computeFileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

// Verify checks if the binary has been modified since startup.
func (c *Checker) Verify() (bool, error) {
	hash, err := computeFileHash(c.binaryPath)
	if err != nil {
		return false, fmt.Errorf("failed to compute hash: %w", err)
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	c.currentHash = hash
	c.lastChecked = time.Now()

	if hash != c.startupHash {
		c.tampered = true
		log.Printf("[Integrity] TAMPER DETECTED! Expected: %s, Got: %s", c.startupHash, hash)

		if c.onTamper != nil {
			c.onTamper(c.startupHash, hash)
		}
		return false, nil
	}

	return true, nil
}

// RunPeriodicCheck starts periodic integrity verification.
func (c *Checker) RunPeriodicCheck(ctx context.Context, interval time.Duration) {
	log.Printf("[Integrity] Starting periodic verification (interval: %v)...", interval)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[Integrity] Stopping periodic check.")
			return
		case <-ticker.C:
			ok, err := c.Verify()
			if err != nil {
				log.Printf("[Integrity] Verification error: %v", err)
			} else if ok {
				log.Println("[Integrity] Binary integrity OK.")
			}
		}
	}
}

// GetStartupHash returns the hash computed at agent startup.
func (c *Checker) GetStartupHash() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.startupHash
}

// GetCurrentHash returns the most recently computed hash.
func (c *Checker) GetCurrentHash() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.currentHash
}

// IsTampered returns whether tampering has been detected.
func (c *Checker) IsTampered() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.tampered
}
