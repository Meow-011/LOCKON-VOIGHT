"""
LOCKON VOIGHT — Scoring Engine Unit Tests

Tests the IoA scoring algorithm, time-based decay, domain/process classification,
and dynamic policy enforcement without requiring a database.

Usage:
    cd server
    python -m pytest ../tests/test_scoring_engine.py -v
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock

# Adjust import path for running from project root
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

from app.scoring.engine import ScoringEngine, IOA_WEIGHTS


# ════════════════════════════════════════════════════════
#  Fixtures
# ════════════════════════════════════════════════════════

@pytest.fixture
def engine():
    """Fresh ScoringEngine instance for each test."""
    return ScoringEngine()


def make_indicator(ioa_type: str, age_minutes: float = 0, details: str = "") -> dict:
    """Helper to create an indicator dict with a specific age."""
    detected_at = datetime.now(timezone.utc) - timedelta(minutes=age_minutes)
    return {
        "type": ioa_type,
        "detected_at": detected_at,
        "details": details,
    }


# ════════════════════════════════════════════════════════
#  Score Calculation Tests
# ════════════════════════════════════════════════════════

class TestScoreCalculation:
    """Tests for the core scoring algorithm."""

    def test_empty_indicators_returns_green(self, engine):
        """No indicators → score 0, level GREEN."""
        result = engine.calculate_score([])
        assert result["score"] == 0
        assert result["level"] == "GREEN"
        assert result["indicator_count"] == 0

    def test_single_binary_tamper_maxes_score(self, engine):
        """BINARY_TAMPER (weight 100) → score 100, level RED."""
        indicators = [make_indicator("BINARY_TAMPER", age_minutes=0)]
        result = engine.calculate_score(indicators)
        assert result["score"] == 100
        assert result["level"] == "RED"

    def test_single_ai_editor_scores_80(self, engine):
        """AI_EDITOR (weight 80) within recent window → score 80."""
        indicators = [make_indicator("AI_EDITOR", age_minutes=0)]
        result = engine.calculate_score(indicators)
        assert result["score"] == 80
        assert result["level"] == "RED"

    def test_score_capped_at_100(self, engine):
        """Multiple critical indicators should cap at 100, never exceed."""
        indicators = [
            make_indicator("BINARY_TAMPER", age_minutes=0),
            make_indicator("HEARTBEAT_TIMEOUT", age_minutes=0),
            make_indicator("LOCAL_LLM", age_minutes=0),
        ]
        result = engine.calculate_score(indicators)
        assert result["score"] == 100  # Capped
        assert result["indicator_count"] == 3

    def test_unknown_indicator_type_ignored(self, engine):
        """Unknown IoA types should be silently skipped."""
        indicators = [make_indicator("NONEXISTENT_TYPE", age_minutes=0)]
        result = engine.calculate_score(indicators)
        assert result["score"] == 0
        assert result["indicator_count"] == 0

    def test_breakdown_contains_details(self, engine):
        """Breakdown should include all metadata for each indicator."""
        indicators = [make_indicator("GPU_SPIKE", age_minutes=0, details="GPU: 95.3%")]
        result = engine.calculate_score(indicators)
        assert len(result["breakdown"]) == 1
        bd = result["breakdown"][0]
        assert bd["type"] == "GPU_SPIKE"
        assert bd["base_weight"] == 50
        assert bd["severity"] == "MEDIUM"
        assert bd["details"] == "GPU: 95.3%"
        assert "detected_at" in bd
        assert "age_minutes" in bd


# ════════════════════════════════════════════════════════
#  Time Decay Tests
# ════════════════════════════════════════════════════════

class TestTimeDecay:
    """Tests for the time-based decay factor calculation."""

    def test_decay_recent_is_full(self, engine):
        """Indicators within SCORE_DECAY_RECENT_MINUTES → decay 1.0."""
        indicators = [make_indicator("AI_EDITOR", age_minutes=0.5)]
        result = engine.calculate_score(indicators)
        assert result["score"] == 80  # 80 × 1.0

    def test_decay_medium_reduces_score(self, engine):
        """Indicators in medium window → decay 0.7."""
        # Default: recent=1, medium=2 → age 1.5 falls in medium
        indicators = [make_indicator("AI_EDITOR", age_minutes=1.5)]
        result = engine.calculate_score(indicators)
        assert result["score"] == 56  # 80 × 0.7 = 56

    def test_decay_old_reduces_further(self, engine):
        """Indicators in old window → decay 0.4."""
        # Default: medium=2, old=3 → age 2.5 falls in old
        indicators = [make_indicator("AI_EDITOR", age_minutes=2.5)]
        result = engine.calculate_score(indicators)
        assert result["score"] == 32  # 80 × 0.4 = 32

    def test_decay_ancient_is_minimal(self, engine):
        """Indicators beyond old window → decay 0.1."""
        indicators = [make_indicator("AI_EDITOR", age_minutes=60)]
        result = engine.calculate_score(indicators)
        assert result["score"] == 8  # 80 × 0.1 = 8

    def test_mixed_age_indicators(self, engine):
        """Multiple indicators with different ages should apply different decays."""
        indicators = [
            make_indicator("AI_EDITOR", age_minutes=0),     # 80 × 1.0 = 80
            make_indicator("GPU_SPIKE", age_minutes=60),    # 50 × 0.1 = 5
        ]
        result = engine.calculate_score(indicators)
        assert result["score"] == 85  # 80 + 5 = 85


# ════════════════════════════════════════════════════════
#  Score Level Tests
# ════════════════════════════════════════════════════════

class TestScoreLevels:
    """Tests for score-to-level classification."""

    def test_level_green_below_threshold(self, engine):
        """Score < 30 → GREEN."""
        # VRAM_SPIKE (60) decayed to ancient: 60 × 0.1 = 6
        indicators = [make_indicator("VRAM_SPIKE", age_minutes=60)]
        result = engine.calculate_score(indicators)
        assert result["level"] == "GREEN"

    def test_level_yellow_at_threshold(self, engine):
        """Score >= 30 and < 70 → YELLOW."""
        # GPU_SPIKE (50) recent: 50 × 1.0 = 50
        indicators = [make_indicator("GPU_SPIKE", age_minutes=0)]
        result = engine.calculate_score(indicators)
        assert result["score"] == 50
        assert result["level"] == "YELLOW"

    def test_level_red_at_threshold(self, engine):
        """Score >= 70 → RED."""
        # AI_EDITOR (80) recent: 80 × 1.0 = 80
        indicators = [make_indicator("AI_EDITOR", age_minutes=0)]
        result = engine.calculate_score(indicators)
        assert result["level"] == "RED"

    def test_exact_green_boundary(self, engine):
        """Score exactly at green threshold (29) → GREEN."""
        assert engine._score_to_level(29) == "GREEN"

    def test_exact_yellow_boundary(self, engine):
        """Score exactly at yellow threshold (30) → YELLOW."""
        assert engine._score_to_level(30) == "YELLOW"

    def test_exact_red_boundary(self, engine):
        """Score exactly at red threshold (70) → RED."""
        assert engine._score_to_level(70) == "RED"


# ════════════════════════════════════════════════════════
#  Network Domain Classification Tests
# ════════════════════════════════════════════════════════

class TestNetworkClassification:
    """Tests for domain-based network classification."""

    def test_critical_domain_openai(self, engine):
        """api.openai.com → NETWORK_AI_CRITICAL."""
        assert engine.classify_network_event("api.openai.com") == "NETWORK_AI_CRITICAL"

    def test_critical_domain_anthropic(self, engine):
        """api.anthropic.com → NETWORK_AI_CRITICAL."""
        assert engine.classify_network_event("api.anthropic.com") == "NETWORK_AI_CRITICAL"

    def test_critical_domain_claude(self, engine):
        """claude.ai → NETWORK_AI_CRITICAL."""
        assert engine.classify_network_event("claude.ai") == "NETWORK_AI_CRITICAL"

    def test_high_domain_groq(self, engine):
        """api.groq.com → NETWORK_AI_HIGH."""
        assert engine.classify_network_event("api.groq.com") == "NETWORK_AI_HIGH"

    def test_high_domain_copilot(self, engine):
        """copilot-proxy.githubusercontent.com → NETWORK_AI_HIGH."""
        assert engine.classify_network_event("copilot-proxy.githubusercontent.com") == "NETWORK_AI_HIGH"

    def test_subdomain_match_critical(self, engine):
        """Subdomains of critical domains should match."""
        assert engine.classify_network_event("v1.api.openai.com") == "NETWORK_AI_CRITICAL"

    def test_subdomain_match_high(self, engine):
        """Subdomains of high domains should match."""
        assert engine.classify_network_event("us-east.api.groq.com") == "NETWORK_AI_HIGH"

    def test_unknown_domain_returns_none(self, engine):
        """Non-AI domains → None."""
        assert engine.classify_network_event("google.com") is None

    def test_empty_domain_returns_none(self, engine):
        """Empty domain → None."""
        assert engine.classify_network_event("") is None

    def test_case_insensitive(self, engine):
        """Domain matching should be case-insensitive."""
        assert engine.classify_network_event("API.OPENAI.COM") == "NETWORK_AI_CRITICAL"

    def test_trailing_dot_stripped(self, engine):
        """DNS trailing dots should be stripped."""
        assert engine.classify_network_event("api.openai.com.") == "NETWORK_AI_CRITICAL"


# ════════════════════════════════════════════════════════
#  Process Classification Tests
# ════════════════════════════════════════════════════════

class TestProcessClassification:
    """Tests for process category-based classification."""

    def test_ai_editor_maps_correctly(self, engine):
        assert engine.classify_process("AI_EDITOR") == "AI_EDITOR"

    def test_local_llm_maps_correctly(self, engine):
        assert engine.classify_process("LOCAL_LLM") == "LOCAL_LLM"

    def test_ai_agent_maps_correctly(self, engine):
        assert engine.classify_process("AI_AGENT") == "AI_AGENT"

    def test_evasion_maps_to_proxy_vpn(self, engine):
        assert engine.classify_process("EVASION") == "PROXY_VPN"

    def test_normal_process_returns_none(self, engine):
        assert engine.classify_process("NORMAL") is None

    def test_unknown_category_returns_none(self, engine):
        assert engine.classify_process("SOMETHING_ELSE") is None


# ════════════════════════════════════════════════════════
#  Dynamic Policy Tests
# ════════════════════════════════════════════════════════

class TestDynamicPolicy:
    """Tests for dynamic policy override behavior."""

    def _make_mock_policy(self, domains=None, processes=None):
        """Create a mock SystemPolicy object."""
        policy = MagicMock()
        policy.domains = domains or []
        policy.processes = processes or []
        return policy

    def test_dynamic_domain_escalate(self, engine):
        """Dynamic ESCALATE domain → NETWORK_AI_CRITICAL."""
        policy = self._make_mock_policy(
            domains=[{"domain": "evil-ai.example.com", "action": "ESCALATE"}]
        )
        engine.update_dynamic_policy(policy)
        assert engine.classify_network_event("evil-ai.example.com") == "NETWORK_AI_CRITICAL"

    def test_dynamic_domain_warn(self, engine):
        """Dynamic WARN domain → NETWORK_AI_HIGH."""
        policy = self._make_mock_policy(
            domains=[{"domain": "suspicious.example.com", "action": "WARN"}]
        )
        engine.update_dynamic_policy(policy)
        assert engine.classify_network_event("suspicious.example.com") == "NETWORK_AI_HIGH"

    def test_dynamic_domain_log_only(self, engine):
        """Dynamic LOG_ONLY domain → None (no score impact)."""
        policy = self._make_mock_policy(
            domains=[{"domain": "monitored.example.com", "action": "LOG_ONLY"}]
        )
        engine.update_dynamic_policy(policy)
        assert engine.classify_network_event("monitored.example.com") is None

    def test_dynamic_domain_subdomain_match(self, engine):
        """Dynamic policy should match subdomains."""
        policy = self._make_mock_policy(
            domains=[{"domain": "example.com", "action": "ESCALATE"}]
        )
        engine.update_dynamic_policy(policy)
        assert engine.classify_network_event("api.example.com") == "NETWORK_AI_CRITICAL"

    def test_dynamic_process_escalate(self, engine):
        """Dynamic ESCALATE process → AI_AGENT."""
        policy = self._make_mock_policy(
            processes=[{"name": "custom-ai-tool", "action": "ESCALATE"}]
        )
        engine.update_dynamic_policy(policy)
        assert engine.classify_process("AI_EDITOR", process_name="custom-ai-tool") == "AI_AGENT"

    def test_dynamic_process_warn(self, engine):
        """Dynamic WARN process → AI_EDITOR."""
        policy = self._make_mock_policy(
            processes=[{"name": "suspicious-app", "action": "WARN"}]
        )
        engine.update_dynamic_policy(policy)
        assert engine.classify_process("NORMAL", process_name="suspicious-app") == "AI_EDITOR"

    def test_dynamic_process_log_only(self, engine):
        """Dynamic LOG_ONLY process → None."""
        policy = self._make_mock_policy(
            processes=[{"name": "harmless-tool", "action": "LOG_ONLY"}]
        )
        engine.update_dynamic_policy(policy)
        assert engine.classify_process("NORMAL", process_name="harmless-tool") is None

    def test_empty_policy_clears_dynamic(self, engine):
        """Setting an empty policy should clear dynamic rules."""
        # First, set a policy
        policy = self._make_mock_policy(
            domains=[{"domain": "evil.com", "action": "ESCALATE"}]
        )
        engine.update_dynamic_policy(policy)
        assert engine.classify_network_event("evil.com") == "NETWORK_AI_CRITICAL"

        # Then clear it
        empty_policy = self._make_mock_policy(domains=[], processes=[])
        engine.update_dynamic_policy(empty_policy)
        # evil.com is not in hardcoded list, so should return None
        assert engine.classify_network_event("evil.com") is None

    def test_dynamic_fallback_to_hardcoded(self, engine):
        """When dynamic policy doesn't match, hardcoded rules still apply."""
        policy = self._make_mock_policy(
            domains=[{"domain": "custom-only.com", "action": "ESCALATE"}]
        )
        engine.update_dynamic_policy(policy)
        # api.openai.com is not in dynamic policy but IS in hardcoded
        assert engine.classify_network_event("api.openai.com") == "NETWORK_AI_CRITICAL"


# ════════════════════════════════════════════════════════
#  IoA Weight Table Integrity Tests
# ════════════════════════════════════════════════════════

class TestWeightTable:
    """Tests to verify the IoA weight table structure is correct."""

    def test_all_weights_have_required_keys(self):
        """Every IoA entry must have weight, severity, and description."""
        for ioa_type, info in IOA_WEIGHTS.items():
            assert "weight" in info, f"{ioa_type} missing 'weight'"
            assert "severity" in info, f"{ioa_type} missing 'severity'"
            assert "description" in info, f"{ioa_type} missing 'description'"

    def test_all_weights_are_positive_integers(self):
        """All weights must be positive integers between 1-100."""
        for ioa_type, info in IOA_WEIGHTS.items():
            assert isinstance(info["weight"], int), f"{ioa_type} weight is not int"
            assert 1 <= info["weight"] <= 100, f"{ioa_type} weight {info['weight']} out of range"

    def test_severity_values_are_valid(self):
        """All severities must be one of the defined levels."""
        valid_severities = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
        for ioa_type, info in IOA_WEIGHTS.items():
            assert info["severity"] in valid_severities, (
                f"{ioa_type} has invalid severity: {info['severity']}"
            )

    def test_binary_tamper_is_max_weight(self):
        """BINARY_TAMPER should have the highest weight (100)."""
        assert IOA_WEIGHTS["BINARY_TAMPER"]["weight"] == 100

    def test_get_weight_returns_correct_value(self, engine):
        """get_weight() should return the correct weight for known types."""
        assert engine.get_weight("BINARY_TAMPER") == 100
        assert engine.get_weight("GPU_SPIKE") == 50
        assert engine.get_weight("NONEXISTENT") == 0


# ════════════════════════════════════════════════════════
#  Memory Forensics & eBPF IoA Tests
# ════════════════════════════════════════════════════════

class TestMemoryForensicsScoring:
    """Tests for the Memory Forensics IoA type (MEMORY_MODEL_LOADED)."""

    def test_memory_model_loaded_exists_in_weights(self):
        """MEMORY_MODEL_LOADED must be defined in IOA_WEIGHTS."""
        assert "MEMORY_MODEL_LOADED" in IOA_WEIGHTS

    def test_memory_model_loaded_is_critical(self):
        """MEMORY_MODEL_LOADED should be CRITICAL severity."""
        assert IOA_WEIGHTS["MEMORY_MODEL_LOADED"]["severity"] == "CRITICAL"

    def test_memory_model_loaded_weight_95(self):
        """MEMORY_MODEL_LOADED should have weight 95."""
        assert IOA_WEIGHTS["MEMORY_MODEL_LOADED"]["weight"] == 95

    def test_memory_model_loaded_scores_high(self, engine):
        """A fresh MEMORY_MODEL_LOADED indicator → score 95, RED."""
        indicators = [make_indicator("MEMORY_MODEL_LOADED", age_minutes=0,
                                    details="GGUF tensor in PID 1234 (ollama)")]
        result = engine.calculate_score(indicators)
        assert result["score"] == 95
        assert result["level"] == "RED"

    def test_memory_model_decays_over_time(self, engine):
        """MEMORY_MODEL_LOADED should decay like other indicators."""
        indicators = [make_indicator("MEMORY_MODEL_LOADED", age_minutes=60)]
        result = engine.calculate_score(indicators)
        # 95 × 0.1 (ancient decay) = 9.5 → 9 (rounded)
        assert result["score"] < 20


class TestEbpfScoring:
    """Tests for eBPF kernel event IoA types."""

    def test_ebpf_exec_ai_exists_in_weights(self):
        """EBPF_EXEC_AI must be defined in IOA_WEIGHTS."""
        assert "EBPF_EXEC_AI" in IOA_WEIGHTS

    def test_ebpf_exec_ai_is_high(self):
        """EBPF_EXEC_AI should be HIGH severity."""
        assert IOA_WEIGHTS["EBPF_EXEC_AI"]["severity"] == "HIGH"

    def test_ebpf_exec_ai_weight_85(self):
        """EBPF_EXEC_AI should have weight 85."""
        assert IOA_WEIGHTS["EBPF_EXEC_AI"]["weight"] == 85

    def test_ebpf_file_model_access_exists_in_weights(self):
        """EBPF_FILE_MODEL_ACCESS must be defined in IOA_WEIGHTS."""
        assert "EBPF_FILE_MODEL_ACCESS" in IOA_WEIGHTS

    def test_ebpf_file_model_access_weight_75(self):
        """EBPF_FILE_MODEL_ACCESS should have weight 75."""
        assert IOA_WEIGHTS["EBPF_FILE_MODEL_ACCESS"]["weight"] == 75

    def test_ebpf_exec_scores_red(self, engine):
        """EBPF_EXEC_AI recent → score 85, RED."""
        indicators = [make_indicator("EBPF_EXEC_AI", age_minutes=0,
                                    details="eBPF EXEC: ollama (PID 5678)")]
        result = engine.calculate_score(indicators)
        assert result["score"] == 85
        assert result["level"] == "RED"

    def test_ebpf_file_model_scores_high(self, engine):
        """EBPF_FILE_MODEL_ACCESS recent → score 75, RED."""
        indicators = [make_indicator("EBPF_FILE_MODEL_ACCESS", age_minutes=0,
                                    details="eBPF FILE_OPEN: model.gguf")]
        result = engine.calculate_score(indicators)
        assert result["score"] == 75
        assert result["level"] == "RED"

    def test_combined_ebpf_and_memory_caps_at_100(self, engine):
        """eBPF exec + memory finding combined should cap at 100."""
        indicators = [
            make_indicator("EBPF_EXEC_AI", age_minutes=0),
            make_indicator("MEMORY_MODEL_LOADED", age_minutes=0),
        ]
        result = engine.calculate_score(indicators)
        assert result["score"] == 100
        assert result["indicator_count"] == 2

class TestDisconnectScoring:
    """Tests for GUI disconnection IoA."""

    def test_intentional_disconnect_exists_in_weights(self):
        """INTENTIONAL_DISCONNECT must be defined in IOA_WEIGHTS."""
        assert "INTENTIONAL_DISCONNECT" in IOA_WEIGHTS

    def test_intentional_disconnect_is_critical(self):
        """INTENTIONAL_DISCONNECT should be CRITICAL severity."""
        assert IOA_WEIGHTS["INTENTIONAL_DISCONNECT"]["severity"] == "CRITICAL"
        assert IOA_WEIGHTS["INTENTIONAL_DISCONNECT"]["weight"] == 95

    def test_intentional_disconnect_scores_red(self, engine):
        """A fresh INTENTIONAL_DISCONNECT indicator → score 95, RED."""
        indicators = [make_indicator("INTENTIONAL_DISCONNECT", age_minutes=0,
                                    details="Contestant intentionally disconnected")]
        result = engine.calculate_score(indicators)
        assert result["score"] == 95
        assert result["level"] == "RED"
