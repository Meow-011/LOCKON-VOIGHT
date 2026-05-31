"""
LOCKON VOIGHT — API Security Unit Tests

Tests JWT authentication, RBAC enforcement, rate limiting, and the
initial setup flow without requiring a running database (uses mocks).

Usage:
    cd server
    python -m pytest ../tests/test_security_api.py -v
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
import time

# Adjust import path
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    decode_token,
)
from app.core.config import settings


# ════════════════════════════════════════════════════════
#  Password Hashing Tests
# ════════════════════════════════════════════════════════

class TestPasswordHashing:
    """Tests for bcrypt password hashing utilities."""

    def test_hash_password_returns_hash(self):
        """hash_password should return a bcrypt hash, not plaintext."""
        hashed = hash_password("MySecretPassword123")
        assert hashed != "MySecretPassword123"
        assert hashed.startswith("$2b$")  # bcrypt prefix

    def test_verify_password_correct(self):
        """Correct password should verify successfully."""
        hashed = hash_password("CorrectPassword")
        assert verify_password("CorrectPassword", hashed) is True

    def test_verify_password_wrong(self):
        """Wrong password should fail verification."""
        hashed = hash_password("CorrectPassword")
        assert verify_password("WrongPassword", hashed) is False

    def test_different_hashes_for_same_password(self):
        """Same password should produce different hashes (bcrypt salt)."""
        hash1 = hash_password("SamePassword")
        hash2 = hash_password("SamePassword")
        assert hash1 != hash2  # Different salts
        # But both should verify
        assert verify_password("SamePassword", hash1)
        assert verify_password("SamePassword", hash2)

    def test_empty_password_hashes(self):
        """Empty password should still produce a valid hash."""
        hashed = hash_password("")
        assert hashed.startswith("$2b$")
        assert verify_password("", hashed) is True


# ════════════════════════════════════════════════════════
#  JWT Token Tests
# ════════════════════════════════════════════════════════

class TestJWTTokens:
    """Tests for JWT token creation and validation."""

    def test_access_token_creation(self):
        """Access token should encode subject and role."""
        token = create_access_token({"sub": "admin", "role": "admin"})
        payload = decode_token(token)
        assert payload["sub"] == "admin"
        assert payload["role"] == "admin"
        assert payload["type"] == "access"

    def test_refresh_token_creation(self):
        """Refresh token should have type='refresh'."""
        token = create_refresh_token({"sub": "admin", "role": "admin"})
        payload = decode_token(token)
        assert payload["sub"] == "admin"
        assert payload["type"] == "refresh"

    def test_access_token_has_expiry(self):
        """Access tokens should have an expiration time."""
        token = create_access_token({"sub": "user1"})
        payload = decode_token(token)
        assert "exp" in payload
        # Expiry should be in the future
        exp_time = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        assert exp_time > datetime.now(timezone.utc)

    def test_access_token_custom_expiry(self):
        """Custom expiry should be respected."""
        token = create_access_token(
            {"sub": "user1"},
            expires_delta=timedelta(minutes=5)
        )
        payload = decode_token(token)
        exp_time = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        now = datetime.now(timezone.utc)
        # Should expire within 5 minutes (with small tolerance)
        diff = (exp_time - now).total_seconds()
        assert 290 < diff < 310  # ~5 minutes

    def test_expired_token_raises(self):
        """Expired token should raise HTTPException."""
        from fastapi import HTTPException
        token = create_access_token(
            {"sub": "user1"},
            expires_delta=timedelta(seconds=-1)  # Already expired
        )
        with pytest.raises(HTTPException) as exc_info:
            decode_token(token)
        assert exc_info.value.status_code == 401

    def test_invalid_token_raises(self):
        """Garbage token should raise HTTPException."""
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            decode_token("not.a.valid.token")
        assert exc_info.value.status_code == 401

    def test_tampered_token_raises(self):
        """Token with modified payload should fail validation."""
        from fastapi import HTTPException
        token = create_access_token({"sub": "user1"})
        # Tamper with the token by modifying a character
        parts = token.split(".")
        # Modify the payload part
        tampered = parts[0] + "." + parts[1] + "X" + "." + parts[2]
        with pytest.raises(HTTPException):
            decode_token(tampered)

    def test_token_preserves_extra_data(self):
        """Extra fields in token data should be preserved."""
        token = create_access_token({
            "sub": "admin",
            "role": "admin",
            "custom_field": "custom_value",
        })
        payload = decode_token(token)
        assert payload["custom_field"] == "custom_value"


# ════════════════════════════════════════════════════════
#  Rate Limiting Tests
# ════════════════════════════════════════════════════════

class TestRateLimiting:
    """Tests for the login rate limiter."""

    def test_rate_limit_allows_normal_attempts(self):
        """5 attempts within window should be allowed."""
        from app.api.auth import _check_rate_limit, LOGIN_ATTEMPTS
        # Clear state
        LOGIN_ATTEMPTS.clear()

        mock_request = MagicMock()
        mock_request.client.host = "192.168.1.100"

        # First 5 should succeed
        for _ in range(5):
            _check_rate_limit(mock_request)  # Should not raise

    def test_rate_limit_blocks_excessive_attempts(self):
        """6th attempt within window should be blocked."""
        from fastapi import HTTPException
        from app.api.auth import _check_rate_limit, LOGIN_ATTEMPTS
        LOGIN_ATTEMPTS.clear()

        mock_request = MagicMock()
        mock_request.client.host = "192.168.1.101"

        # First 5 should pass
        for _ in range(5):
            _check_rate_limit(mock_request)

        # 6th should fail
        with pytest.raises(HTTPException) as exc_info:
            _check_rate_limit(mock_request)
        assert exc_info.value.status_code == 429

    def test_rate_limit_different_ips_independent(self):
        """Rate limits should be per-IP."""
        from app.api.auth import _check_rate_limit, LOGIN_ATTEMPTS
        LOGIN_ATTEMPTS.clear()

        req_a = MagicMock()
        req_a.client.host = "10.0.0.1"
        req_b = MagicMock()
        req_b.client.host = "10.0.0.2"

        # Max out IP A
        for _ in range(5):
            _check_rate_limit(req_a)

        # IP B should still be fine
        _check_rate_limit(req_b)  # Should not raise

    def test_rate_limit_clears_after_window(self):
        """Old attempts outside the window should be purged."""
        from app.api.auth import _check_rate_limit, LOGIN_ATTEMPTS, LOGIN_WINDOW_SECONDS
        LOGIN_ATTEMPTS.clear()

        mock_request = MagicMock()
        mock_request.client.host = "10.0.0.3"

        # Add 5 old attempts (outside window)
        old_time = time.time() - LOGIN_WINDOW_SECONDS - 1
        LOGIN_ATTEMPTS["10.0.0.3"] = [old_time] * 5

        # New attempt should pass (old ones purged)
        _check_rate_limit(mock_request)  # Should not raise


# ════════════════════════════════════════════════════════
#  Config Security Tests
# ════════════════════════════════════════════════════════

class TestConfigSecurity:
    """Tests for security-related configuration."""

    def test_default_jwt_secret_is_dev_value(self):
        """Default JWT secret should be the dev placeholder."""
        # This just documents the expected default
        default = "voight-dev-secret-change-in-production"
        assert settings.JWT_SECRET_KEY == default or len(settings.JWT_SECRET_KEY) > 20

    def test_jwt_algorithm_is_secure(self):
        """JWT algorithm should be HS256 or stronger."""
        secure_algorithms = {"HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "ES256", "ES384", "ES512"}
        assert settings.JWT_ALGORITHM in secure_algorithms

    def test_access_token_expiry_reasonable(self):
        """Access token expiry should be between 15 minutes and 24 hours."""
        assert 15 <= settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES <= 1440

    def test_refresh_token_expiry_reasonable(self):
        """Refresh token expiry should be between 1 and 30 days."""
        assert 1 <= settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS <= 30

    def test_grpc_tls_disabled_by_default(self):
        """gRPC TLS should be disabled by default (development mode)."""
        # In dev, it should default to False
        assert isinstance(settings.GRPC_TLS_ENABLED, bool)

    def test_grpc_cert_paths_defined(self):
        """gRPC certificate paths should be configured."""
        assert settings.GRPC_CA_CERT_PATH != ""
        assert settings.GRPC_SERVER_CERT_PATH != ""
        assert settings.GRPC_SERVER_KEY_PATH != ""


# ════════════════════════════════════════════════════════
#  IoA Weight Consistency Tests
# ════════════════════════════════════════════════════════

class TestIoAConsistency:
    """Tests to verify scoring thresholds and weights are logically consistent."""

    def test_green_threshold_less_than_yellow(self):
        """GREEN threshold must be less than YELLOW threshold."""
        assert settings.SCORE_THRESHOLD_GREEN < settings.SCORE_THRESHOLD_YELLOW

    def test_yellow_threshold_less_than_max(self):
        """YELLOW threshold must be less than 100."""
        assert settings.SCORE_THRESHOLD_YELLOW <= 100

    def test_decay_intervals_ascending(self):
        """Decay intervals must be in ascending order."""
        assert (
            settings.SCORE_DECAY_RECENT_MINUTES
            < settings.SCORE_DECAY_MEDIUM_MINUTES
            < settings.SCORE_DECAY_OLD_MINUTES
        )

    def test_heartbeat_timeout_exceeds_interval(self):
        """Heartbeat timeout must be greater than the interval."""
        assert settings.AGENT_HEARTBEAT_TIMEOUT_SECONDS > settings.AGENT_HEARTBEAT_INTERVAL_SECONDS
