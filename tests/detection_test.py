"""
LOCKON VOIGHT — Detection Accuracy Test (Task 5.2)
Tests the scoring engine with known AI tool scenarios.

Usage:
    python tests/detection_test.py
"""

import sys
import os
from datetime import datetime, timezone, timedelta

# Add server to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))

from app.scoring.engine import ScoringEngine, IOA_WEIGHTS


class DetectionTestSuite:
    """Validates IoA detection accuracy and scoring correctness."""

    def __init__(self):
        self.engine = ScoringEngine()
        self.passed = 0
        self.failed = 0

    def assert_equal(self, actual, expected, test_name):
        if actual == expected:
            self.passed += 1
            print(f"  ✅ {test_name}")
        else:
            self.failed += 1
            print(f"  ❌ {test_name} — Expected: {expected}, Got: {actual}")

    def assert_true(self, condition, test_name):
        if condition:
            self.passed += 1
            print(f"  ✅ {test_name}")
        else:
            self.failed += 1
            print(f"  ❌ {test_name}")

    def run_all(self):
        print("╔════════════════════════════════════════════╗")
        print("║  LOCKON VOIGHT — Detection Accuracy Tests  ║")
        print("╚════════════════════════════════════════════╝\n")

        self.test_weight_table_completeness()
        self.test_clean_contestant()
        self.test_single_ai_editor()
        self.test_local_llm_critical()
        self.test_network_classification()
        self.test_combined_score_cap()
        self.test_time_decay()
        self.test_score_levels()
        self.test_binary_tamper_max_weight()

        print(f"\n{'=' * 50}")
        print(f"  Results: {self.passed} passed, {self.failed} failed")
        print(f"  {'✅ ALL TESTS PASSED' if self.failed == 0 else '❌ SOME TESTS FAILED'}")
        print(f"{'=' * 50}")

        return self.failed == 0

    def test_weight_table_completeness(self):
        """Verify all IoA types have weights defined."""
        print("\n── Weight Table Completeness ──")
        expected_types = [
            "AI_EDITOR", "LOCAL_LLM", "AI_AGENT",
            "NETWORK_AI_CRITICAL", "NETWORK_AI_HIGH",
            "GPU_SPIKE", "VRAM_SPIKE", "MODEL_FILE",
            "AI_EXTENSION", "PROXY_VPN",
            "HEARTBEAT_TIMEOUT", "BINARY_TAMPER",
        ]
        for ioa_type in expected_types:
            self.assert_true(
                ioa_type in IOA_WEIGHTS,
                f"IoA type '{ioa_type}' exists in weight table"
            )

    def test_clean_contestant(self):
        """A contestant with no indicators should score 0 / GREEN."""
        print("\n── Clean Contestant ──")
        result = self.engine.calculate_score([])
        self.assert_equal(result["score"], 0, "Empty indicators → score 0")
        self.assert_equal(result["level"], "GREEN", "Empty indicators → GREEN")

    def test_single_ai_editor(self):
        """Detecting an AI editor should score 80 / RED."""
        print("\n── Single AI Editor Detection ──")
        indicators = [{
            "type": "AI_EDITOR",
            "detected_at": datetime.now(timezone.utc),
            "details": "cursor.exe detected",
        }]
        result = self.engine.calculate_score(indicators)
        self.assert_equal(result["score"], 80, "AI_EDITOR weight = 80")
        self.assert_equal(result["level"], "RED", "Score 80 → RED level")

    def test_local_llm_critical(self):
        """Local LLM detection is CRITICAL (weight 90)."""
        print("\n── Local LLM Detection ──")
        indicators = [{
            "type": "LOCAL_LLM",
            "detected_at": datetime.now(timezone.utc),
            "details": "ollama serve",
        }]
        result = self.engine.calculate_score(indicators)
        self.assert_equal(result["score"], 90, "LOCAL_LLM weight = 90")
        self.assert_equal(result["level"], "RED", "Score 90 → RED level")

    def test_network_classification(self):
        """Network domain classification accuracy."""
        print("\n── Network Domain Classification ──")

        critical_domains = ["api.openai.com", "api.anthropic.com", "claude.ai"]
        for domain in critical_domains:
            result = self.engine.classify_network_event(domain)
            self.assert_equal(result, "NETWORK_AI_CRITICAL", f"'{domain}' → CRITICAL")

        high_domains = ["api.deepseek.com", "api.mistral.ai", "api.groq.com"]
        for domain in high_domains:
            result = self.engine.classify_network_event(domain)
            self.assert_equal(result, "NETWORK_AI_HIGH", f"'{domain}' → HIGH")

        safe_domains = ["github.com", "stackoverflow.com", "python.org"]
        for domain in safe_domains:
            result = self.engine.classify_network_event(domain)
            self.assert_equal(result, None, f"'{domain}' → None (safe)")

    def test_combined_score_cap(self):
        """Score should cap at 100 even with multiple indicators."""
        print("\n── Score Cap at 100 ──")
        now = datetime.now(timezone.utc)
        indicators = [
            {"type": "LOCAL_LLM", "detected_at": now, "details": ""},      # 90
            {"type": "AI_EDITOR", "detected_at": now, "details": ""},       # 80
            {"type": "NETWORK_AI_CRITICAL", "detected_at": now, "details": ""},  # 90
        ]
        result = self.engine.calculate_score(indicators)
        self.assert_equal(result["score"], 100, "Combined 260 → capped at 100")

    def test_time_decay(self):
        """Scores should decay over time."""
        print("\n── Time-Based Decay ──")
        now = datetime.now(timezone.utc)

        # Recent (0-5 min) → decay 1.0
        recent = [{"type": "AI_EDITOR", "detected_at": now, "details": ""}]
        result_recent = self.engine.calculate_score(recent)
        self.assert_equal(result_recent["score"], 80, "Recent (0-5 min): 80 × 1.0 = 80")

        # Medium (5-15 min) → decay 0.7
        medium = [{"type": "AI_EDITOR", "detected_at": now - timedelta(minutes=10), "details": ""}]
        result_medium = self.engine.calculate_score(medium)
        self.assert_equal(result_medium["score"], 56, "Medium (10 min): 80 × 0.7 = 56")

        # Old (15-30 min) → decay 0.4
        old = [{"type": "AI_EDITOR", "detected_at": now - timedelta(minutes=20), "details": ""}]
        result_old = self.engine.calculate_score(old)
        self.assert_equal(result_old["score"], 32, "Old (20 min): 80 × 0.4 = 32")

        # Ancient (>30 min) → decay 0.1
        ancient = [{"type": "AI_EDITOR", "detected_at": now - timedelta(minutes=45), "details": ""}]
        result_ancient = self.engine.calculate_score(ancient)
        self.assert_equal(result_ancient["score"], 8, "Ancient (45 min): 80 × 0.1 = 8")

    def test_score_levels(self):
        """Verify score → level mapping."""
        print("\n── Score Level Boundaries ──")
        self.assert_equal(self.engine._score_to_level(0), "GREEN", "Score 0 → GREEN")
        self.assert_equal(self.engine._score_to_level(29), "GREEN", "Score 29 → GREEN")
        self.assert_equal(self.engine._score_to_level(30), "YELLOW", "Score 30 → YELLOW")
        self.assert_equal(self.engine._score_to_level(69), "YELLOW", "Score 69 → YELLOW")
        self.assert_equal(self.engine._score_to_level(70), "RED", "Score 70 → RED")
        self.assert_equal(self.engine._score_to_level(100), "RED", "Score 100 → RED")

    def test_binary_tamper_max_weight(self):
        """Binary tamper should have the maximum weight (100)."""
        print("\n── Binary Tamper Weight ──")
        weight = self.engine.get_weight("BINARY_TAMPER")
        self.assert_equal(weight, 100, "BINARY_TAMPER = 100 (max weight)")


if __name__ == "__main__":
    suite = DetectionTestSuite()
    success = suite.run_all()
    sys.exit(0 if success else 1)
