"""
IoA (Indicators of AI) Scoring Engine.
Implements the weighted scoring algorithm with time-based decay.
"""

from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional
import json

from app.core.config import settings


# ──────────────────────────────────────────────
# IoA Weight Table
# ──────────────────────────────────────────────

IOA_WEIGHTS: Dict[str, Dict] = {
    # AI Editors
    "AI_EDITOR": {
        "weight": 80,
        "severity": "HIGH",
        "description": "AI-powered code editor detected (e.g., Cursor, Windsurf, Zed)",
    },
    # Local LLM Runtimes
    "LOCAL_LLM": {
        "weight": 90,
        "severity": "CRITICAL",
        "description": "Local LLM runtime detected (e.g., Ollama, LM Studio, vLLM)",
    },
    # AI Agents
    "AI_AGENT": {
        "weight": 85,
        "severity": "CRITICAL",
        "description": "AI agent framework detected (e.g., AutoGPT, OpenDevin)",
    },
    # Network — AI API connections
    "NETWORK_AI_CRITICAL": {
        "weight": 90,
        "severity": "CRITICAL",
        "description": "Connection to critical AI API (OpenAI, Anthropic)",
    },
    "NETWORK_AI_HIGH": {
        "weight": 85,
        "severity": "HIGH",
        "description": "Connection to AI API (Google, DeepSeek, Mistral)",
    },
    # Resource anomalies
    "GPU_SPIKE": {
        "weight": 50,
        "severity": "MEDIUM",
        "description": "GPU usage sustained above 80% for 30+ seconds",
    },
    "VRAM_SPIKE": {
        "weight": 60,
        "severity": "MEDIUM",
        "description": "VRAM usage sustained above 4GB for 60+ seconds",
    },
    # File detection
    "MODEL_FILE": {
        "weight": 70,
        "severity": "HIGH",
        "description": "Large AI model file detected on filesystem",
    },
    # Browser extension
    "AI_EXTENSION": {
        "weight": 65,
        "severity": "MEDIUM",
        "description": "AI-related browser extension detected",
    },
    # Evasion
    "PROXY_VPN": {
        "weight": 40,
        "severity": "MEDIUM",
        "description": "Proxy or VPN connection detected",
    },
    # Tamper detection
    "HEARTBEAT_TIMEOUT": {
        "weight": 95,
        "severity": "CRITICAL",
        "description": "Agent heartbeat missed for 30+ seconds",
    },
    "BINARY_TAMPER": {
        "weight": 100,
        "severity": "CRITICAL",
        "description": "Agent binary hash mismatch — tamper detected",
    },
}


# Critical AI domain mapping for network scoring
CRITICAL_AI_DOMAINS = {
    "api.openai.com", "chat.openai.com", "chatgpt.com", "openai.com",
    "api.anthropic.com", "claude.ai",
}

HIGH_AI_DOMAINS = {
    "generativelanguage.googleapis.com", "gemini.google.com",
    "api.deepseek.com", "chat.deepseek.com",
    "api.mistral.ai", "api.cohere.ai",
    "api.perplexity.ai", "api.groq.com",
    "api.together.xyz", "api-inference.huggingface.co",
    "copilot-proxy.githubusercontent.com", "api.githubcopilot.com",
}


class ScoringEngine:
    """
    Calculates Integrity Scores based on IoA indicators with time-based decay.

    Formula:
        Raw Score = Σ (indicator_weight × decay_factor)
        Final Score = min(Raw Score, 100)

    Decay factors:
        - Within 5 min:  1.0
        - 5-15 min:      0.7
        - 15-30 min:     0.4
        - >30 min:       0.1
    """

    def __init__(self):
        self.decay_recent = settings.SCORE_DECAY_RECENT_MINUTES  # 5
        self.decay_medium = settings.SCORE_DECAY_MEDIUM_MINUTES  # 15
        self.decay_old = settings.SCORE_DECAY_OLD_MINUTES        # 30
        self.threshold_green = settings.SCORE_THRESHOLD_GREEN    # 30
        self.threshold_yellow = settings.SCORE_THRESHOLD_YELLOW  # 70
        
        # Dynamic policy cache
        self.dynamic_domains: Dict[str, str] = {}
        self.dynamic_processes: Dict[str, str] = {}
        
    def update_dynamic_policy(self, policy):
        """Update the internal cache from a SystemPolicy model."""
        self.dynamic_domains = {}
        self.dynamic_processes = {}
        
        if policy:
            for rule in policy.domains:
                domain = rule.get('domain', '').lower().strip('.')
                if domain:
                    self.dynamic_domains[domain] = rule.get('action', 'WARN')
            
            for rule in policy.processes:
                name = rule.get('name', '').lower()
                if name:
                    self.dynamic_processes[name] = rule.get('action', 'WARN')

    def calculate_score(self, indicators: List[Dict]) -> Dict:
        """
        Calculate the integrity score from a list of indicators.

        Args:
            indicators: List of dicts with keys:
                - type: str (IoA type from IOA_WEIGHTS)
                - detected_at: datetime
                - details: Optional[str]

        Returns:
            Dict with score, level, and breakdown.
        """
        now = datetime.now(timezone.utc)
        raw_score = 0.0
        breakdown = []

        for indicator in indicators:
            ioa_type = indicator.get("type", "")
            detected_at = indicator.get("detected_at", now)
            details = indicator.get("details", "")

            # Get weight for this indicator type
            ioa_info = IOA_WEIGHTS.get(ioa_type)
            if not ioa_info:
                continue

            weight = ioa_info["weight"]
            decay = self._calculate_decay(now, detected_at)
            weighted_score = weight * decay

            raw_score += weighted_score

            breakdown.append({
                "type": ioa_type,
                "base_weight": weight,
                "decay_factor": round(decay, 2),
                "weighted_score": round(weighted_score, 1),
                "severity": ioa_info["severity"],
                "description": ioa_info["description"],
                "details": details,
                "detected_at": detected_at.isoformat(),
                "age_minutes": round((now - detected_at).total_seconds() / 60, 1),
            })

        final_score = min(int(raw_score), 100)
        level = self._score_to_level(final_score)

        return {
            "score": final_score,
            "level": level,
            "breakdown": breakdown,
            "indicator_count": len(breakdown),
            "calculated_at": now.isoformat(),
        }

    def _calculate_decay(self, now: datetime, detected_at: datetime) -> float:
        """Calculate time-based decay factor."""
        age = now - detected_at
        age_minutes = age.total_seconds() / 60

        if age_minutes <= self.decay_recent:
            return 1.0
        elif age_minutes <= self.decay_medium:
            return 0.7
        elif age_minutes <= self.decay_old:
            return 0.4
        else:
            return 0.1

    def _score_to_level(self, score: int) -> str:
        """Convert numeric score to GREEN/YELLOW/RED level."""
        if score < self.threshold_green:
            return "GREEN"
        elif score < self.threshold_yellow:
            return "YELLOW"
        else:
            return "RED"

    def classify_network_event(self, domain: str) -> Optional[str]:
        """Classify a network connection domain into an IoA type using dynamic policy."""
        domain_lower = domain.lower().strip(".")
        
        # If dynamic policy is set, use it
        if self.dynamic_domains:
            # Check exact match
            action = self.dynamic_domains.get(domain_lower)
            # Check subdomain match
            if not action:
                for d, act in self.dynamic_domains.items():
                    if domain_lower.endswith("." + d):
                        action = act
                        break
            
            if action == "ESCALATE":
                return "NETWORK_AI_CRITICAL"
            elif action == "WARN":
                return "NETWORK_AI_HIGH"
            elif action == "LOG_ONLY":
                return None  # Log only, no score impact
        
        # Fallback to hardcoded if no dynamic match found (or dynamic policy empty)
        if domain_lower in CRITICAL_AI_DOMAINS:
            return "NETWORK_AI_CRITICAL"
        if domain_lower in HIGH_AI_DOMAINS:
            return "NETWORK_AI_HIGH"
        for d in CRITICAL_AI_DOMAINS:
            if domain_lower.endswith("." + d):
                return "NETWORK_AI_CRITICAL"
        for d in HIGH_AI_DOMAINS:
            if domain_lower.endswith("." + d):
                return "NETWORK_AI_HIGH"
        return None

    def classify_process(self, category: str, process_name: str = "") -> Optional[str]:
        """Map agent process to IoA type. Uses process name for dynamic policy matching."""
        if process_name and self.dynamic_processes:
            action = self.dynamic_processes.get(process_name.lower())
            if action == "ESCALATE":
                return "AI_AGENT"  # Map escalate to critical weight
            elif action == "WARN":
                return "AI_EDITOR" # Map warn to high weight
            elif action == "LOG_ONLY":
                return None
                
        # Fallback to category mapped by agent
        mapping = {
            "AI_EDITOR": "AI_EDITOR",
            "LOCAL_LLM": "LOCAL_LLM",
            "AI_AGENT": "AI_AGENT",
            "EVASION": "PROXY_VPN",
        }
        return mapping.get(category)

    def get_weight(self, ioa_type: str) -> int:
        """Get the weight for an IoA type."""
        info = IOA_WEIGHTS.get(ioa_type)
        return info["weight"] if info else 0


# Singleton
scoring_engine = ScoringEngine()
