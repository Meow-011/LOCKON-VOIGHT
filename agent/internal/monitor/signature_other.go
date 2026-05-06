//go:build !windows

// Package monitor provides system monitoring capabilities for the VOIGHT Agent.
package monitor

import (
	"context"
	"sync"
)

// SignatureScanner is a no-op on non-Windows platforms.
// Digital signature checking is only available on Windows via Authenticode.
type SignatureScanner struct {
	mu    sync.RWMutex
	cache map[string]*signatureCacheEntry
}

type signatureCacheEntry struct {
	category  ProcessCategory
}

// NewSignatureScanner creates a new (no-op) signature scanner for non-Windows.
func NewSignatureScanner() *SignatureScanner {
	return &SignatureScanner{
		cache: make(map[string]*signatureCacheEntry),
	}
}

// CheckSignature always returns CategoryNormal on non-Windows platforms.
func (ss *SignatureScanner) CheckSignature(ctx context.Context, exePath string) ProcessCategory {
	return CategoryNormal
}

// CleanCache is a no-op on non-Windows.
func (ss *SignatureScanner) CleanCache() {}
