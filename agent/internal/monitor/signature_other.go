//go:build !windows && !darwin

// Package monitor provides system monitoring capabilities for the VOIGHT Agent.
package monitor

import (
	"context"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// Known AI vendor identifiers found in ELF binaries on Linux.
// These are matched against:
//   1. The output of `file` command (ELF metadata, comments)
//   2. Embedded strings in the binary (build path, Go module path, etc.)
//   3. Package manager metadata (dpkg/rpm) for the binary path
type linuxVendorSignature struct {
	Pattern  string          // Substring to match (lowercase)
	Category ProcessCategory // How to classify this vendor
}

var knownLinuxAIVendors = []linuxVendorSignature{
	// AI Code Editors
	{Pattern: "anysphere", Category: CategoryAIEditor},      // Cursor
	{Pattern: "cursor-", Category: CategoryAIEditor},         // Cursor (AppImage naming)
	{Pattern: "codeium", Category: CategoryAIEditor},         // Windsurf / Codeium
	{Pattern: "tabnine", Category: CategoryAIEditor},         // Tabnine
	{Pattern: "continue.dev", Category: CategoryAIEditor},    // Continue extension

	// Local LLM Runtimes
	{Pattern: "ollama", Category: CategoryLocalLLM},           // Ollama
	{Pattern: "gpt4all", Category: CategoryLocalLLM},          // GPT4All
	{Pattern: "nomic", Category: CategoryLocalLLM},            // Nomic (GPT4All parent)
	{Pattern: "lmstudio", Category: CategoryLocalLLM},         // LM Studio
	{Pattern: "llamacpp", Category: CategoryLocalLLM},         // llama.cpp
	{Pattern: "llama-cpp", Category: CategoryLocalLLM},        // llama.cpp variant
	{Pattern: "koboldcpp", Category: CategoryLocalLLM},        // KoboldCpp
	{Pattern: "text-generation", Category: CategoryLocalLLM},  // HF text-generation-inference

	// AI Agents / Desktop Apps
	{Pattern: "openai", Category: CategoryAIAgent},            // OpenAI
}

// SignatureScanner checks ELF binary metadata and embedded strings on Linux.
type SignatureScanner struct {
	mu    sync.RWMutex
	cache map[string]*signatureCacheEntry // exePath -> result (cached)
}

type signatureCacheEntry struct {
	category  ProcessCategory
	checkedAt time.Time
}

const signatureCacheTTL = 10 * time.Minute

// NewSignatureScanner creates a new signature scanner for Linux.
func NewSignatureScanner() *SignatureScanner {
	return &SignatureScanner{
		cache: make(map[string]*signatureCacheEntry),
	}
}

// CheckSignature inspects a Linux ELF binary for known AI vendor indicators.
// Uses multiple strategies: symlink resolution, `strings` extraction, and package manager queries.
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

	// Run detection
	category := ss.inspectELF(ctx, exePath)

	// Cache result
	ss.mu.Lock()
	ss.cache[exePath] = &signatureCacheEntry{
		category:  category,
		checkedAt: time.Now(),
	}
	ss.mu.Unlock()

	return category
}

// inspectELF uses multiple strategies to identify a Linux binary's origin.
func (ss *SignatureScanner) inspectELF(ctx context.Context, exePath string) ProcessCategory {
	// Strategy 1: Resolve symlinks to find the real binary path
	// e.g., /usr/bin/cursor -> /opt/cursor/cursor -> reveals vendor
	realPath, err := os.Readlink(exePath)
	if err != nil {
		realPath = exePath
	}

	lowerPath := strings.ToLower(realPath)
	for _, vendor := range knownLinuxAIVendors {
		if strings.Contains(lowerPath, vendor.Pattern) {
			log.Printf("[SignatureScanner] AI vendor detected via path: %s (match: %s)", realPath, vendor.Pattern)
			return vendor.Category
		}
	}

	// Strategy 2: Extract embedded strings from the binary (Go module path, build info, etc.)
	// Use `strings` command with a length filter to avoid noise
	cmd := exec.CommandContext(ctx, "strings", "-n", "10", exePath)
	out, err := cmd.Output()
	if err == nil {
		// Only check first 50KB of strings output to avoid performance issues
		output := string(out)
		if len(output) > 51200 {
			output = output[:51200]
		}
		lowerOutput := strings.ToLower(output)

		for _, vendor := range knownLinuxAIVendors {
			if strings.Contains(lowerOutput, vendor.Pattern) {
				log.Printf("[SignatureScanner] AI vendor detected via embedded strings: %s (match: %s)", exePath, vendor.Pattern)
				return vendor.Category
			}
		}
	}

	// Strategy 3: Check package manager for binary provenance
	// dpkg (Debian/Ubuntu)
	if cat := ss.checkDpkg(ctx, exePath); cat != CategoryNormal {
		return cat
	}

	// rpm (Fedora/RHEL)
	if cat := ss.checkRpm(ctx, exePath); cat != CategoryNormal {
		return cat
	}

	return CategoryNormal
}

// checkDpkg queries dpkg to find which package owns the binary.
func (ss *SignatureScanner) checkDpkg(ctx context.Context, exePath string) ProcessCategory {
	cmd := exec.CommandContext(ctx, "dpkg", "-S", exePath)
	out, err := cmd.Output()
	if err != nil {
		return CategoryNormal
	}

	lowerOutput := strings.ToLower(string(out))
	for _, vendor := range knownLinuxAIVendors {
		if strings.Contains(lowerOutput, vendor.Pattern) {
			log.Printf("[SignatureScanner] AI vendor detected via dpkg: %s (match: %s)", exePath, vendor.Pattern)
			return vendor.Category
		}
	}
	return CategoryNormal
}

// checkRpm queries rpm to find which package owns the binary.
func (ss *SignatureScanner) checkRpm(ctx context.Context, exePath string) ProcessCategory {
	cmd := exec.CommandContext(ctx, "rpm", "-qf", exePath)
	out, err := cmd.Output()
	if err != nil {
		return CategoryNormal
	}

	lowerOutput := strings.ToLower(string(out))
	for _, vendor := range knownLinuxAIVendors {
		if strings.Contains(lowerOutput, vendor.Pattern) {
			log.Printf("[SignatureScanner] AI vendor detected via rpm: %s (match: %s)", exePath, vendor.Pattern)
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
