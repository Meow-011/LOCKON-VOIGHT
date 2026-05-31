// Package screen provides cross-platform screen capture capabilities.
// When enabled by the Proctor, the Agent periodically captures screenshots
// and sends them to the server for Dashboard viewing.
package screen

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/jpeg"
	"log"
	"sync"
	"time"

	"github.com/kbinani/screenshot"
)

// CaptureResult holds a captured screenshot.
type CaptureResult struct {
	ImageData []byte
	Width     int
	Height    int
	Format    string
	Timestamp time.Time
}

// Broadcaster manages periodic screen capture and transmission.
type Broadcaster struct {
	mu       sync.RWMutex
	enabled  bool
	interval time.Duration
	quality  int
	cancel   context.CancelFunc
}

// NewBroadcaster creates a new screen broadcaster.
func NewBroadcaster() *Broadcaster {
	return &Broadcaster{
		interval: 5 * time.Second,
		quality:  30, // JPEG quality (1-100), low = smaller file
	}
}

// SetEnabled enables or disables screen broadcasting.
func (b *Broadcaster) SetEnabled(enabled bool) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.enabled == enabled {
		return
	}

	b.enabled = enabled
	if enabled {
		log.Println("[Screen] 📷 Screen broadcasting ENABLED.")
	} else {
		log.Println("[Screen] Screen broadcasting DISABLED.")
		// Cancel any running broadcast loop
		if b.cancel != nil {
			b.cancel()
			b.cancel = nil
		}
	}
}

// SetInterval sets the capture interval.
func (b *Broadcaster) SetInterval(seconds int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if seconds < 2 {
		seconds = 2
	}
	b.interval = time.Duration(seconds) * time.Second
}

// IsEnabled returns whether broadcasting is active.
func (b *Broadcaster) IsEnabled() bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.enabled
}

// CaptureScreen takes a screenshot of the primary display and returns JPEG bytes.
func (b *Broadcaster) CaptureScreen() (*CaptureResult, error) {
	numDisplays := screenshot.NumActiveDisplays()
	if numDisplays == 0 {
		return nil, fmt.Errorf("no active displays found")
	}

	// Capture primary display (index 0)
	bounds := screenshot.GetDisplayBounds(0)

	img, err := screenshot.CaptureRect(bounds)
	if err != nil {
		return nil, fmt.Errorf("failed to capture screen: %w", err)
	}

	// Downscale if the image is very large (> 1920 width)
	finalImg := maybeDownscale(img, 1280)

	// Encode as JPEG with low quality for bandwidth efficiency
	var buf bytes.Buffer
	err = jpeg.Encode(&buf, finalImg, &jpeg.Options{Quality: b.quality})
	if err != nil {
		return nil, fmt.Errorf("failed to encode JPEG: %w", err)
	}

	return &CaptureResult{
		ImageData: buf.Bytes(),
		Width:     finalImg.Bounds().Dx(),
		Height:    finalImg.Bounds().Dy(),
		Format:    "jpeg",
		Timestamp: time.Now(),
	}, nil
}

// StartBroadcasting begins the periodic capture loop. It calls sendFn for each captured frame.
// The loop runs until the context is cancelled or broadcasting is disabled.
func (b *Broadcaster) StartBroadcasting(ctx context.Context, sendFn func(data []byte) error) {
	b.mu.Lock()
	if b.cancel != nil {
		b.cancel() // Stop any existing loop
	}
	broadcastCtx, cancel := context.WithCancel(ctx)
	b.cancel = cancel
	b.mu.Unlock()

	go func() {
		log.Printf("[Screen] Starting broadcast loop (interval: %v)...", b.interval)

		for {
			b.mu.RLock()
			interval := b.interval
			enabled := b.enabled
			b.mu.RUnlock()

			if !enabled {
				log.Println("[Screen] Broadcasting stopped (disabled).")
				return
			}

			select {
			case <-broadcastCtx.Done():
				log.Println("[Screen] Broadcasting stopped (context cancelled).")
				return
			case <-time.After(interval):
				result, err := b.CaptureScreen()
				if err != nil {
					log.Printf("[Screen] Capture failed: %v", err)
					continue
				}

				if err := sendFn(result.ImageData); err != nil {
					log.Printf("[Screen] Failed to send screenshot: %v", err)
					// Don't stop the loop — server might come back
					continue
				}

				log.Printf("[Screen] Sent screenshot (%dx%d, %dKB)", result.Width, result.Height, len(result.ImageData)/1024)
			}
		}
	}()
}

// maybeDownscale resizes an image if its width exceeds maxWidth.
// Uses simple nearest-neighbor for speed (quality isn't critical for monitoring).
func maybeDownscale(img *image.RGBA, maxWidth int) image.Image {
	bounds := img.Bounds()
	if bounds.Dx() <= maxWidth {
		return img
	}

	ratio := float64(maxWidth) / float64(bounds.Dx())
	newWidth := maxWidth
	newHeight := int(float64(bounds.Dy()) * ratio)

	dst := image.NewRGBA(image.Rect(0, 0, newWidth, newHeight))

	for y := 0; y < newHeight; y++ {
		srcY := int(float64(y) / ratio)
		for x := 0; x < newWidth; x++ {
			srcX := int(float64(x) / ratio)
			dst.Set(x, y, img.At(srcX, srcY))
		}
	}

	return dst
}
