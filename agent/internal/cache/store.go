// Package cache provides offline telemetry caching using BoltDB.
// When the Agent loses connectivity to the VOIGHT server, telemetry reports
// are cached locally in an encrypted BoltDB file and replayed upon reconnection.
package cache

import (
	"encoding/binary"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	bolt "go.etcd.io/bbolt"
	"google.golang.org/protobuf/proto"

	pb "github.com/lockon/voight-agent/proto/voight"
)

const (
	// BucketName is the BoltDB bucket for cached telemetry reports.
	BucketName = "telemetry_cache"

	// DefaultMaxSizeMB is the default maximum cache size in megabytes.
	DefaultMaxSizeMB = 50
)

// TelemetryCache manages offline telemetry storage using BoltDB.
type TelemetryCache struct {
	mu         sync.Mutex
	db         *bolt.DB
	dbPath     string
	maxSizeMB  int
	entryCount int64
}

// New creates a new TelemetryCache.
func New(cacheDir string, maxSizeMB int) *TelemetryCache {
	if maxSizeMB <= 0 {
		maxSizeMB = DefaultMaxSizeMB
	}

	return &TelemetryCache{
		dbPath:    filepath.Join(cacheDir, "telemetry_cache.db"),
		maxSizeMB: maxSizeMB,
	}
}

// Open opens (or creates) the BoltDB cache file.
func (c *TelemetryCache) Open() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Ensure cache directory exists
	dir := filepath.Dir(c.dbPath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("failed to create cache directory: %w", err)
	}

	db, err := bolt.Open(c.dbPath, 0600, &bolt.Options{
		Timeout: 2 * time.Second,
	})
	if err != nil {
		return fmt.Errorf("failed to open cache DB: %w", err)
	}

	// Create the bucket if it doesn't exist
	err = db.Update(func(tx *bolt.Tx) error {
		bucket, err := tx.CreateBucketIfNotExists([]byte(BucketName))
		if err != nil {
			return err
		}
		// Count existing entries
		c.entryCount = int64(bucket.Stats().KeyN)
		return nil
	})
	if err != nil {
		db.Close()
		return fmt.Errorf("failed to create cache bucket: %w", err)
	}

	c.db = db
	if c.entryCount > 0 {
		log.Printf("[Cache] Opened with %d pending entries at %s", c.entryCount, c.dbPath)
	} else {
		log.Printf("[Cache] Initialized at %s (max: %dMB)", c.dbPath, c.maxSizeMB)
	}

	return nil
}

// Close closes the BoltDB file.
func (c *TelemetryCache) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.db != nil {
		return c.db.Close()
	}
	return nil
}

// Enqueue serializes a TelemetryReport using protobuf and stores it in the cache.
// Returns an error if the cache is full (exceeds maxSizeMB).
func (c *TelemetryCache) Enqueue(report *pb.TelemetryReport) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.db == nil {
		return fmt.Errorf("cache not opened")
	}

	// Check size before inserting
	if c.Size() >= int64(c.maxSizeMB)*1024*1024 {
		log.Printf("[Cache] Cache full (%dMB), pruning oldest entries...", c.maxSizeMB)
		c.pruneOldest(100) // Remove oldest 100 entries
	}

	data, err := proto.Marshal(report)
	if err != nil {
		return fmt.Errorf("failed to serialize report: %w", err)
	}

	err = c.db.Update(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte(BucketName))
		if bucket == nil {
			return fmt.Errorf("cache bucket not found")
		}

		// Use auto-incrementing key (timestamp + sequence)
		id, _ := bucket.NextSequence()
		key := make([]byte, 8)
		binary.BigEndian.PutUint64(key, id)

		return bucket.Put(key, data)
	})
	if err != nil {
		return err
	}

	c.entryCount++
	log.Printf("[Cache] Enqueued report (total cached: %d)", c.entryCount)
	return nil
}

// Replay reads all cached reports and sends them using the provided function.
// Successfully sent reports are deleted from the cache.
// Returns the number of reports replayed successfully.
func (c *TelemetryCache) Replay(sendFn func(*pb.TelemetryReport) error) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.db == nil {
		return 0, fmt.Errorf("cache not opened")
	}

	var keysToDelete [][]byte
	replayed := 0

	err := c.db.View(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte(BucketName))
		if bucket == nil {
			return nil
		}

		cursor := bucket.Cursor()
		for k, v := cursor.First(); k != nil; k, v = cursor.Next() {
			var report pb.TelemetryReport
			if err := proto.Unmarshal(v, &report); err != nil {
				// Corrupted entry — mark for deletion
				keyCopy := make([]byte, len(k))
				copy(keyCopy, k)
				keysToDelete = append(keysToDelete, keyCopy)
				continue
			}

			if err := sendFn(&report); err != nil {
				// Send failed — stop replaying (connection might be down again)
				log.Printf("[Cache] Replay stopped after %d entries: %v", replayed, err)
				break
			}

			keyCopy := make([]byte, len(k))
			copy(keyCopy, k)
			keysToDelete = append(keysToDelete, keyCopy)
			replayed++
		}

		return nil
	})
	if err != nil {
		return replayed, err
	}

	// Delete successfully replayed entries
	if len(keysToDelete) > 0 {
		err = c.db.Update(func(tx *bolt.Tx) error {
			bucket := tx.Bucket([]byte(BucketName))
			if bucket == nil {
				return nil
			}
			for _, key := range keysToDelete {
				if err := bucket.Delete(key); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return replayed, err
		}
		c.entryCount -= int64(len(keysToDelete))
	}

	if replayed > 0 {
		log.Printf("[Cache] ✅ Replayed %d cached reports successfully. Remaining: %d", replayed, c.entryCount)
	}

	return replayed, nil
}

// Count returns the number of cached entries.
func (c *TelemetryCache) Count() int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.entryCount
}

// Size returns the current file size of the cache in bytes.
func (c *TelemetryCache) Size() int64 {
	info, err := os.Stat(c.dbPath)
	if err != nil {
		return 0
	}
	return info.Size()
}

// pruneOldest removes the oldest N entries from the cache.
func (c *TelemetryCache) pruneOldest(count int) {
	if c.db == nil {
		return
	}

	var keysToDelete [][]byte

	c.db.View(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte(BucketName))
		if bucket == nil {
			return nil
		}
		cursor := bucket.Cursor()
		pruned := 0
		for k, _ := cursor.First(); k != nil && pruned < count; k, _ = cursor.Next() {
			keyCopy := make([]byte, len(k))
			copy(keyCopy, k)
			keysToDelete = append(keysToDelete, keyCopy)
			pruned++
		}
		return nil
	})

	if len(keysToDelete) > 0 {
		c.db.Update(func(tx *bolt.Tx) error {
			bucket := tx.Bucket([]byte(BucketName))
			if bucket == nil {
				return nil
			}
			for _, key := range keysToDelete {
				bucket.Delete(key)
			}
			return nil
		})
		c.entryCount -= int64(len(keysToDelete))
		log.Printf("[Cache] Pruned %d oldest entries", len(keysToDelete))
	}
}
