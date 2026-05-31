// Package config provides configuration management for the VOIGHT Agent.
package config

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// Config holds all agent configuration.
type Config struct {
	// Server connection
	ServerAddress string `json:"server_address"`
	GRPCPort      int    `json:"grpc_port"`
	UseTLS        bool   `json:"use_tls"`

	// mTLS certificates
	CACertPath    string `json:"ca_cert_path"`
	AgentCertPath string `json:"agent_cert_path"`
	AgentKeyPath  string `json:"agent_key_path"`

	// Enrollment
	CompetitionKey string `json:"competition_key"`
	TeamName       string `json:"team_name"`
	ContestantName string `json:"contestant_name"`

	// Scan intervals
	HeartbeatInterval    time.Duration `json:"-"`
	HeartbeatIntervalSec int           `json:"heartbeat_interval_seconds"`
	ProcessScanInterval  time.Duration `json:"-"`
	ProcessScanSec       int           `json:"process_scan_interval_seconds"`
	NetworkScanInterval  time.Duration `json:"-"`
	NetworkScanSec       int           `json:"network_scan_interval_seconds"`
	ResourceScanInterval time.Duration `json:"-"`
	ResourceScanSec      int           `json:"resource_scan_interval_seconds"`

	// Detection rules
	AIProcessNames      []string `json:"ai_process_names"`
	AIDomains           []string `json:"ai_domains"`
	ModelFileExtensions []string `json:"model_file_extensions"`
	ModelFileSizeMinMB  int64    `json:"model_file_size_min_mb"`
	FileScanPaths       []string `json:"file_scan_paths"`

	// Agent identity (set after enrollment)
	AgentID       string `json:"agent_id"`
	ContestantID  string `json:"contestant_id"`
	CompetitionID string `json:"competition_id"`

	// Remediation
	AutoKillEnabled bool `json:"auto_kill_enabled"`
}

// SharedDetectionRules represents the shared detection_rules.json structure.
type SharedDetectionRules struct {
	AIDomains struct {
		Critical []string `json:"critical"`
		High     []string `json:"high"`
	} `json:"ai_domains"`
	AIProcessNames      []string `json:"ai_process_names"`
	ModelFileExtensions []string `json:"model_file_extensions"`
	ModelFileSizeMinMB  int64    `json:"model_file_size_min_mb"`
}

// loadSharedRules attempts to load shared detection rules from a JSON file.
// Returns nil if the file is not found (expected when agent runs standalone).
func loadSharedRules() *SharedDetectionRules {
	// Try common locations relative to the binary
	searchPaths := []string{
		"shared/detection_rules.json",
		"../shared/detection_rules.json",
		"../../shared/detection_rules.json",
	}

	for _, path := range searchPaths {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var rules SharedDetectionRules
		if err := json.Unmarshal(data, &rules); err != nil {
			continue
		}
		return &rules
	}
	return nil
}

// DefaultConfig returns a Config with sensible defaults.
// It attempts to load shared detection rules from shared/detection_rules.json
// as the single source of truth. Falls back to hardcoded defaults if not found.
func DefaultConfig() *Config {
	cfg := &Config{
		ServerAddress:        "localhost",
		GRPCPort:             50052,
		UseTLS:               true,
		HeartbeatIntervalSec: 10,
		ProcessScanSec:       5,
		NetworkScanSec:       5,
		ResourceScanSec:      5,
		ModelFileSizeMinMB:   100, // Only flag files > 100MB

		// Default AI process names to detect (fallback if shared rules not found)
		AIProcessNames: []string{
			"cursor", "cursor.exe", "windsurf", "windsurf.exe",
			"zed", "zed.exe", "aide", "aide.exe",
			"ollama", "ollama.exe", "ollama_llama_server", "ollama_llama_server.exe",
			"lms", "lms.exe", "lm-studio", "lm studio.exe",
			"vllm", "llamacpp", "llama-server", "llama-server.exe",
			"koboldcpp", "koboldcpp.exe", "text-generation-server",
			"localai", "localai.exe",
			"autogpt", "opendevin", "devika",
			"aider", "aider.exe", "continue", "continue.exe",
			"transformers-cli",
		},

		// Default AI API domains to detect (fallback if shared rules not found)
		AIDomains: []string{
			"api.openai.com", "chat.openai.com", "chatgpt.com", "openai.com",
			"api.anthropic.com", "claude.ai",
			"generativelanguage.googleapis.com", "gemini.google.com", "aistudio.google.com",
			"api.deepseek.com", "chat.deepseek.com",
			"api.mistral.ai", "chat.mistral.ai", "api.cohere.ai",
			"api.perplexity.ai", "api.groq.com", "api.together.xyz",
			"api-inference.huggingface.co", "api.replicate.com",
			"x.ai", "api.x.ai", "openrouter.ai", "api.openrouter.ai",
			"api.fireworks.ai", "api.cerebras.ai", "api.sambanova.ai",
		},

		// Model file extensions to scan
		ModelFileExtensions: []string{
			".gguf", ".safetensors", ".ggml", ".bin", ".pth", ".onnx",
		},

		// Default paths to scan for model files
		FileScanPaths: []string{},
	}

	// Override defaults with shared rules if available
	if rules := loadSharedRules(); rules != nil {
		allDomains := append(rules.AIDomains.Critical, rules.AIDomains.High...)
		if len(allDomains) > 0 {
			cfg.AIDomains = allDomains
		}
		if len(rules.AIProcessNames) > 0 {
			cfg.AIProcessNames = rules.AIProcessNames
		}
		if len(rules.ModelFileExtensions) > 0 {
			cfg.ModelFileExtensions = rules.ModelFileExtensions
		}
		if rules.ModelFileSizeMinMB > 0 {
			cfg.ModelFileSizeMinMB = rules.ModelFileSizeMinMB
		}
	}

	return cfg
}

// LoadFromFile reads config from a JSON file.
func LoadFromFile(path string) (*Config, error) {
	cfg := DefaultConfig()

	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}

	if err := json.Unmarshal(data, cfg); err != nil {
		return cfg, err
	}

	cfg.resolveDurations()
	return cfg, nil
}

// resolveDurations converts second-based fields to time.Duration.
func (c *Config) resolveDurations() {
	c.HeartbeatInterval = time.Duration(c.HeartbeatIntervalSec) * time.Second
	c.ProcessScanInterval = time.Duration(c.ProcessScanSec) * time.Second
	c.NetworkScanInterval = time.Duration(c.NetworkScanSec) * time.Second
	c.ResourceScanInterval = time.Duration(c.ResourceScanSec) * time.Second
}

// Initialize sets up durations from the second-based config values.
func (c *Config) Initialize() {
	c.resolveDurations()
}

// GRPCAddress returns the full gRPC server address.
func (c *Config) GRPCAddress() string {
	return fmt.Sprintf("%s:%d", c.ServerAddress, c.GRPCPort)
}

// SystemPolicyResponse represents the REST API response for policies
type SystemPolicyResponse struct {
	Domains []struct {
		Domain string `json:"domain"`
	} `json:"domains"`
	Processes []struct {
		Name string `json:"name"`
	} `json:"processes"`
	Extensions []struct {
		Ext string `json:"ext"`
	} `json:"extensions"`
	MinSizeMB   int64 `json:"min_file_size_mb"`
	ScanInterval int   `json:"scan_interval"`
}

// FetchGlobalPolicy pulls the latest detection policy from the server REST API.
func (c *Config) FetchGlobalPolicy() error {
	url := fmt.Sprintf("http://%s:8000/api/policy", c.ServerAddress)

	client := http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("policy endpoint requires authentication (status %d) — policy will be received via gRPC heartbeat instead", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("server returned status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var policyResp SystemPolicyResponse
	if err := json.Unmarshal(body, &policyResp); err != nil {
		return err
	}

	// Update local config
	if len(policyResp.Domains) > 0 {
		c.AIDomains = make([]string, len(policyResp.Domains))
		for i, d := range policyResp.Domains {
			c.AIDomains[i] = d.Domain
		}
	}

	if len(policyResp.Processes) > 0 {
		c.AIProcessNames = make([]string, len(policyResp.Processes))
		for i, p := range policyResp.Processes {
			c.AIProcessNames[i] = p.Name
		}
	}

	if len(policyResp.Extensions) > 0 {
		c.ModelFileExtensions = make([]string, len(policyResp.Extensions))
		for i, ext := range policyResp.Extensions {
			c.ModelFileExtensions[i] = ext.Ext
		}
	}

	if policyResp.MinSizeMB > 0 {
		c.ModelFileSizeMinMB = policyResp.MinSizeMB
	}

	if policyResp.ScanInterval > 0 {
		c.ProcessScanSec = policyResp.ScanInterval
		c.NetworkScanSec = policyResp.ScanInterval
		c.ResourceScanSec = policyResp.ScanInterval
		c.resolveDurations()
	}

	return nil
}

// SettingsResponse represents the REST API response for global settings.
type SettingsResponse struct {
	AutoKillProcesses      bool   `json:"autoKillProcesses"`
	ScreenBroadcastEnabled bool   `json:"screenBroadcastEnabled"`
	ScreenCaptureInterval  int    `json:"screenCaptureInterval"`
	WebhookEnabled         bool   `json:"webhookEnabled"`
	WebhookFormat          string `json:"webhookFormat"`
}

// FetchSettings pulls the latest global settings from the server REST API.
// This is used for features that don't need gRPC proto changes (auto-kill, screen broadcast, etc.).
func (c *Config) FetchSettings() (*SettingsResponse, error) {
	url := fmt.Sprintf("http://%s:8000/api/settings/agent", c.ServerAddress)

	client := http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("settings endpoint returned status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var settings SettingsResponse
	if err := json.Unmarshal(body, &settings); err != nil {
		return nil, err
	}

	// Apply auto-kill setting
	c.AutoKillEnabled = settings.AutoKillProcesses

	return &settings, nil
}
