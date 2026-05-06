//go:build windows

// Package monitor provides system monitoring capabilities for the VOIGHT Agent.
package monitor

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// ──────────────────────────────────────────────
// Known AI Vendor Signatures (Authenticode)
// ──────────────────────────────────────────────
// These are the publisher names embedded in the digital certificates
// of known AI tools. Even if the .exe is renamed, the signature
// cannot be forged without the vendor's private key.

type aiVendorSignature struct {
	Publisher string          // Authenticode subject (publisher name)
	Category  ProcessCategory // How to classify this vendor
}

var knownAIVendors = []aiVendorSignature{
	// AI Code Editors
	{Publisher: "anysphere", Category: CategoryAIEditor},    // Cursor
	{Publisher: "cursor", Category: CategoryAIEditor},        // Cursor (alt signing)
	{Publisher: "codeium", Category: CategoryAIEditor},       // Windsurf / Codeium
	{Publisher: "codiumai", Category: CategoryAIEditor},      // CodiumAI (Qodo)
	{Publisher: "tabnine", Category: CategoryAIEditor},       // Tabnine

	// Local LLM Runtimes
	{Publisher: "ollama", Category: CategoryLocalLLM},         // Ollama
	{Publisher: "lm studio", Category: CategoryLocalLLM},      // LM Studio
	{Publisher: "nomic", Category: CategoryLocalLLM},           // Nomic (GPT4All)
	{Publisher: "gpt4all", Category: CategoryLocalLLM},         // GPT4All

	// AI Agents / Desktop Apps
	{Publisher: "openai", Category: CategoryAIAgent},           // ChatGPT Desktop
}

// SignatureScanner checks Authenticode digital signatures on Windows.
type SignatureScanner struct {
	mu    sync.RWMutex
	cache map[string]*signatureCacheEntry // exePath -> result (cached)
}

type signatureCacheEntry struct {
	category  ProcessCategory
	checkedAt time.Time
}

const signatureCacheTTL = 10 * time.Minute

// NewSignatureScanner creates a new signature scanner.
func NewSignatureScanner() *SignatureScanner {
	return &SignatureScanner{
		cache: make(map[string]*signatureCacheEntry),
	}
}

// CheckSignature inspects the Authenticode digital signature of an executable
// and returns a non-NORMAL category if it matches a known AI vendor.
// Results are cached to avoid repeated expensive PowerShell calls.
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

	// Query Authenticode signature via PowerShell
	category := ss.queryAuthenticode(ctx, exePath)

	// Cache result
	ss.mu.Lock()
	ss.cache[exePath] = &signatureCacheEntry{
		category:  category,
		checkedAt: time.Now(),
	}
	ss.mu.Unlock()

	return category
}

// queryAuthenticode runs PowerShell to extract the digital signature publisher.
func (ss *SignatureScanner) queryAuthenticode(ctx context.Context, exePath string) ProcessCategory {
	// PowerShell command to extract the Subject (publisher) from the Authenticode signature
	psCmd := fmt.Sprintf(
		`$sig = Get-AuthenticodeSignature -LiteralPath '%s' -ErrorAction SilentlyContinue; `+
			`if ($sig -and $sig.SignerCertificate) { `+
			`@{ Status = $sig.Status.ToString(); Subject = $sig.SignerCertificate.Subject } | ConvertTo-Json -Compress `+
			`} else { '{}' }`,
		exePath,
	)

	cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", psCmd)
	out, err := cmd.Output()
	if err != nil {
		return CategoryNormal
	}

	var result struct {
		Status  string `json:"Status"`
		Subject string `json:"Subject"`
	}
	if err := json.Unmarshal(out, &result); err != nil {
		return CategoryNormal
	}

	if result.Subject == "" {
		return CategoryNormal
	}

	// Check the Subject field against known AI vendors
	lowerSubject := strings.ToLower(result.Subject)
	for _, vendor := range knownAIVendors {
		if strings.Contains(lowerSubject, vendor.Publisher) {
			log.Printf("[SignatureScanner] AI vendor detected: %s (publisher: %s, status: %s)",
				exePath, result.Subject, result.Status)
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
