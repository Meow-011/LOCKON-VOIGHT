//go:build darwin

// Package monitor provides system monitoring capabilities for the VOIGHT Agent.
package monitor

import (
	"context"
	"log"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// Known AI vendor signing identities on macOS (Apple Developer IDs).
// These correspond to the "Authority" field in `codesign -dvvv` output.
type macVendorSignature struct {
	Identity string          // Substring to match in the signing authority chain
	Category ProcessCategory // How to classify this vendor
}

var knownMacAIVendors = []macVendorSignature{
	// AI Code Editors
	{Identity: "anysphere", Category: CategoryAIEditor},    // Cursor
	{Identity: "cursor", Category: CategoryAIEditor},        // Cursor (alt)
	{Identity: "codeium", Category: CategoryAIEditor},       // Windsurf / Codeium
	{Identity: "tabnine", Category: CategoryAIEditor},       // Tabnine

	// Local LLM Runtimes
	{Identity: "ollama", Category: CategoryLocalLLM},         // Ollama
	{Identity: "nomic", Category: CategoryLocalLLM},           // GPT4All / Nomic
	{Identity: "gpt4all", Category: CategoryLocalLLM},         // GPT4All
	{Identity: "lm studio", Category: CategoryLocalLLM},       // LM Studio

	// AI Agents / Desktop Apps
	{Identity: "openai", Category: CategoryAIAgent},           // ChatGPT Desktop
}

// SignatureScanner checks code signing identities on macOS using `codesign`.
type SignatureScanner struct {
	mu    sync.RWMutex
	cache map[string]*signatureCacheEntry // exePath -> result (cached)
}

type signatureCacheEntry struct {
	category  ProcessCategory
	checkedAt time.Time
}

const signatureCacheTTL = 10 * time.Minute

// NewSignatureScanner creates a new signature scanner for macOS.
func NewSignatureScanner() *SignatureScanner {
	return &SignatureScanner{
		cache: make(map[string]*signatureCacheEntry),
	}
}

// CheckSignature inspects the code signing identity of a macOS executable
// and returns a non-NORMAL category if it matches a known AI vendor.
func (ss *SignatureScanner) CheckSignature(ctx context.Context, exePath string) ProcessCategory {
	if exePath == "" {
		return CategoryNormal
	}

	// Check cache first
	ss.mu.RLock()
	if entry, ok := ss.cache[exePath]; ok {
		if time.Since(entry.checkedAt) < signatureCacheTTL {
			ss.mu.RUnlock()
			return entry.category
		}
	}
	ss.mu.RUnlock()

	// Query codesign
	category := ss.queryCodesign(ctx, exePath)

	// Cache result
	ss.mu.Lock()
	ss.cache[exePath] = &signatureCacheEntry{
		category:  category,
		checkedAt: time.Now(),
	}
	ss.mu.Unlock()

	return category
}

// queryCodesign runs `codesign -dvvv` to extract the signing identity of a macOS binary.
func (ss *SignatureScanner) queryCodesign(ctx context.Context, exePath string) ProcessCategory {
	cmd := exec.CommandContext(ctx, "codesign", "-dvvv", exePath)
	// codesign writes to stderr, not stdout
	out, err := cmd.CombinedOutput()
	if err != nil {
		return CategoryNormal
	}

	outputStr := strings.ToLower(string(out))

	// Check for known AI vendor identities in the signing chain
	for _, vendor := range knownMacAIVendors {
		if strings.Contains(outputStr, vendor.Identity) {
			log.Printf("[SignatureScanner] AI vendor detected via codesign: %s (identity match: %s)", exePath, vendor.Identity)
			return vendor.Category
		}
	}

	return CategoryNormal
}

// CleanCache removes stale entries from the signature cache.
func (ss *SignatureScanner) CleanCache() {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	now := time.Now()
	for path, entry := range ss.cache {
		if now.Sub(entry.checkedAt) > signatureCacheTTL*2 {
			delete(ss.cache, path)
		}
	}
}
