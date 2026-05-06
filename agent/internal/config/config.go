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
}

// DefaultConfig returns a Config with sensible defaults.
func DefaultConfig() *Config {
	return &Config{
		ServerAddress:        "localhost",
		GRPCPort:             50052,
		UseTLS:               true,
		HeartbeatIntervalSec: 10,
		ProcessScanSec:       5,
		NetworkScanSec:       5,
		ResourceScanSec:      5,
		ModelFileSizeMinMB:   100, // Only flag files > 100MB

		// Default AI process names to detect
		AIProcessNames: []string{
			// AI Code Editors
			"cursor", "cursor.exe",
			"windsurf", "windsurf.exe",
			"zed", "zed.exe",
			"aide", "aide.exe",
			// Local LLM Runtimes
			"ollama", "ollama.exe", "ollama_llama_server", "ollama_llama_server.exe",
			"lms", "lms.exe", "lm-studio", "lm studio.exe",
			"vllm", "llamacpp", "llama-server", "llama-server.exe",
			"koboldcpp", "koboldcpp.exe",
			"text-generation-server",
			"localai", "localai.exe",
			// AI Agents
			"autogpt", "opendevin", "devika",
			"aider", "aider.exe",
			"continue", "continue.exe",
			// Python-based (may appear as python with specific args)
			"transformers-cli",
		},

		// Default AI API domains to detect
		AIDomains: []string{
			// OpenAI
			"api.openai.com",
			"chat.openai.com",
			// Anthropic
			"api.anthropic.com",
			"claude.ai",
			// Google
			"generativelanguage.googleapis.com",
			"gemini.google.com",
			"aistudio.google.com",
			// DeepSeek
			"api.deepseek.com",
			"chat.deepseek.com",
			// Mistral
			"api.mistral.ai",
			// Cohere
			"api.cohere.ai",
			// Perplexity
			"api.perplexity.ai",
			// Groq
			"api.groq.com",
			// Together
			"api.together.xyz",
			// Hugging Face
			"api-inference.huggingface.co",
			// Replicate
			"api.replicate.com",
			// xAI (Grok)
			"x.ai",
			"api.x.ai",
			// OpenRouter
			"openrouter.ai",
			"api.openrouter.ai",
			// Mistral Chat
			"chat.mistral.ai",
			// ChatGPT (New domain)
			"chatgpt.com",
			// Other enterprise AI inference
			"api.fireworks.ai",
			"api.cerebras.ai",
			"api.sambanova.ai",
		},

		// Model file extensions to scan
		ModelFileExtensions: []string{
			".gguf",        // llama.cpp quantized models
			".safetensors", // HuggingFace safe format
			".ggml",        // Legacy GGML format
			".bin",         // PyTorch binary (needs size check)
			".pth",         // PyTorch checkpoint
			".onnx",        // ONNX models
		},

		// Default paths to scan for model files
		FileScanPaths: []string{},
	}
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
