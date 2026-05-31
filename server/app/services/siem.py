"""
SIEM Exporter — Sends real-time incident alerts to external webhook endpoints.
Supports Generic JSON, Splunk HEC, and Elastic Common Schema formats.
"""

import logging
import json
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


class SIEMExporter:
    """Handles exporting incident data to external SIEM/webhook endpoints."""

    def __init__(self):
        self._client = httpx.AsyncClient(timeout=10.0)

    async def send_alert(
        self,
        webhook_url: str,
        webhook_format: str,
        incident_data: dict,
        webhook_token: Optional[str] = None,
    ) -> bool:
        """Send an incident alert to the configured webhook endpoint.
        
        Args:
            webhook_url: The target webhook URL.
            webhook_format: One of 'generic', 'splunk_hec', 'elastic'.
            incident_data: Dict containing incident details.
            
        Returns:
            True if the alert was sent successfully, False otherwise.
        """
        if not webhook_url or webhook_url.startswith("https://discord.com/api/webhooks/..."):
            return False  # Skip placeholder URLs

        try:
            if webhook_format == "splunk_hec":
                payload = self._format_splunk_hec(incident_data)
                headers = {"Content-Type": "application/json"}
                if webhook_token:
                    headers["Authorization"] = f"Splunk {webhook_token}"
            elif webhook_format == "elastic":
                payload = self._format_elastic(incident_data)
                headers = {"Content-Type": "application/json"}
                if webhook_token:
                    headers["Authorization"] = f"Bearer {webhook_token}"
            else:
                payload = self._format_generic(incident_data)
                headers = {"Content-Type": "application/json"}
                if webhook_token:
                    headers["Authorization"] = f"Bearer {webhook_token}"

            response = await self._client.post(
                webhook_url,
                content=json.dumps(payload),
                headers=headers,
            )

            if response.status_code < 300:
                logger.info(f"[SIEM] Alert sent successfully to {webhook_url} ({webhook_format})")
                return True
            else:
                logger.warning(
                    f"[SIEM] Webhook returned status {response.status_code}: {response.text[:200]}"
                )
                return False

        except httpx.TimeoutException:
            logger.warning(f"[SIEM] Webhook timed out: {webhook_url}")
            return False
        except Exception as e:
            logger.error(f"[SIEM] Failed to send alert: {e}")
            return False

    def _format_generic(self, data: dict) -> dict:
        """Format as generic JSON webhook (compatible with Discord, Slack, custom endpoints)."""
        return {
            "source": "LOCKON-VOIGHT",
            "event_type": "incident_alert",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "severity": data.get("severity", "MEDIUM"),
            "contestant_id": str(data.get("contestant_id", "")),
            "ioa_type": data.get("ioa_type", "UNKNOWN"),
            "score_delta": data.get("score_delta", 0),
            "total_score": data.get("total_score", 0),
            "evidence": data.get("evidence", ""),
            "details": data.get("details", ""),
        }

    def _format_splunk_hec(self, data: dict) -> dict:
        """Format as Splunk HTTP Event Collector (HEC) payload.
        
        Splunk HEC expects:
        {
            "event": { ... },
            "sourcetype": "voight:incident",
            "source": "lockon-voight",
            "index": "main"
        }
        """
        return {
            "event": {
                "severity": data.get("severity", "MEDIUM"),
                "contestant_id": str(data.get("contestant_id", "")),
                "ioa_type": data.get("ioa_type", "UNKNOWN"),
                "score_delta": data.get("score_delta", 0),
                "total_score": data.get("total_score", 0),
                "evidence": data.get("evidence", ""),
                "details": data.get("details", ""),
            },
            "sourcetype": "voight:incident",
            "source": "lockon-voight",
            "host": "voight-server",
            "time": int(datetime.now(timezone.utc).timestamp()),
        }

    def _format_elastic(self, data: dict) -> dict:
        """Format as Elastic Common Schema (ECS) document.
        
        ECS fields: https://www.elastic.co/guide/en/ecs/current
        """
        return {
            "@timestamp": datetime.now(timezone.utc).isoformat(),
            "event": {
                "kind": "alert",
                "category": ["intrusion_detection"],
                "type": ["indicator"],
                "module": "lockon-voight",
                "dataset": "voight.incident",
                "severity": self._severity_to_number(data.get("severity", "MEDIUM")),
                "outcome": "success",
            },
            "rule": {
                "name": data.get("ioa_type", "UNKNOWN"),
                "description": data.get("details", ""),
            },
            "user": {
                "id": str(data.get("contestant_id", "")),
            },
            "threat": {
                "indicator": {
                    "type": "behavioral",
                    "description": data.get("evidence", ""),
                    "confidence": "High" if data.get("score_delta", 0) >= 50 else "Medium",
                },
            },
            "voight": {
                "score_delta": data.get("score_delta", 0),
                "total_score": data.get("total_score", 0),
            },
        }

    @staticmethod
    def _severity_to_number(severity: str) -> int:
        """Convert severity string to ECS numeric value (1-4)."""
        mapping = {
            "LOW": 1,
            "MEDIUM": 2,
            "HIGH": 3,
            "CRITICAL": 4,
            "INFO": 1,
        }
        return mapping.get(severity.upper(), 2)

    async def send_test(self, webhook_url: str, webhook_format: str, webhook_token: Optional[str] = None) -> dict:
        """Send a test payload to verify webhook connectivity."""
        test_data = {
            "severity": "INFO",
            "contestant_id": "00000000-0000-0000-0000-000000000000",
            "ioa_type": "TEST_ALERT",
            "score_delta": 0,
            "total_score": 0,
            "evidence": "This is a test alert from LOCKON VOIGHT.",
            "details": "Webhook connectivity test — no action required.",
        }
        success = await self.send_alert(webhook_url, webhook_format, test_data, webhook_token)
        return {
            "success": success,
            "message": "Test alert sent successfully." if success else "Failed to send test alert.",
        }

    async def close(self):
        """Close the HTTP client."""
        await self._client.aclose()


# Singleton instance
siem_exporter = SIEMExporter()
