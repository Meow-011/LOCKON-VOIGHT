# Scoring Algorithm & IoA Weight Table

> Part of LOCKON VOIGHT — Integrity Protocol Documentation

## Overview

The Integrity Score quantifies the probability that a contestant is receiving unauthorized AI assistance. It is calculated by the **IoA Scoring Engine** (`server/app/scoring/engine.py`) using a weighted, time-decaying formula applied to active incidents.

---

## Formula

```
Raw Score = Σ (indicator_weight × decay_factor)
Final Score = min(Raw Score, 100)
```

Where `decay_factor` is determined by the age of each indicator:

| Indicator Age | Decay Factor | Rationale |
|---|---|---|
| ≤ 5 minutes | **1.0** | Recent — full weight |
| 5–15 minutes | **0.7** | Moderate — activity may have stopped |
| 15–30 minutes | **0.4** | Aging — likely no longer active |
| > 30 minutes | **0.1** | Stale — minimal residual weight |

This ensures that old detections gradually lose influence, preventing permanent false-positive inflation while still retaining a trace for audit purposes.

---

## IoA Weight Table

| IoA Type | Weight | Severity | Description |
|---|---|---|---|
| `BINARY_TAMPER` | 100 | 🔴 CRITICAL | Agent binary SHA-256 hash mismatch — tamper detected |
| `HEARTBEAT_TIMEOUT` | 95 | 🔴 CRITICAL | Agent heartbeat missed for 30+ seconds |
| `LOCAL_LLM` | 90 | 🔴 CRITICAL | Local LLM runtime detected (Ollama, LM Studio, vLLM) |
| `NETWORK_AI_CRITICAL` | 90 | 🔴 CRITICAL | Connection to critical AI API (OpenAI, Anthropic) |
| `AI_AGENT` | 85 | 🔴 CRITICAL | AI agent framework detected (AutoGPT, OpenDevin) |
| `NETWORK_AI_HIGH` | 85 | 🔴 HIGH | Connection to AI API (Google, DeepSeek, Mistral, Copilot) |
| `AI_EDITOR` | 80 | 🔴 HIGH | AI-powered code editor detected (Cursor, Windsurf, Zed) |
| `MODEL_FILE` | 70 | 🔴 HIGH | Large AI model file detected on filesystem (.gguf, .safetensors) |
| `AI_EXTENSION` | 65 | 🟡 MEDIUM | AI-related browser extension detected |
| `VRAM_SPIKE` | 60 | 🟡 MEDIUM | VRAM usage sustained above 4GB for 60+ seconds |
| `GPU_SPIKE` | 50 | 🟡 MEDIUM | GPU usage sustained above 80% for 30+ seconds |
| `PROXY_VPN` | 40 | 🟡 MEDIUM | Proxy or VPN connection detected |

---

## Score Levels (Thresholds)

Thresholds are configurable via environment variables:

| Level | Score Range | Default Threshold Variable | Meaning |
|---|---|---|---|
| 🟢 **GREEN** | 0 – 29 | `SCORE_THRESHOLD_GREEN=30` | Clean — No actionable AI indicators |
| 🟡 **YELLOW** | 30 – 69 | `SCORE_THRESHOLD_YELLOW=70` | Review — Suspicious activity detected |
| 🔴 **RED** | 70 – 100 | — | Alert — Strong evidence of AI assistance |

---

## Dynamic Policy Scoring

In addition to the hardcoded IoA Weight Table, the Scoring Engine supports **Dynamic Policy** pushed from the Proctor Dashboard:

### Domain Rules
Domains added to the Detection Policy can be assigned an action:
- **ESCALATE** → Maps to `NETWORK_AI_CRITICAL` (weight: 90)
- **WARN** → Maps to `NETWORK_AI_HIGH` (weight: 85)
- **LOG_ONLY** → No score impact (recorded for audit only)

### Process Rules
Processes added to the Detection Policy follow the same pattern:
- **ESCALATE** → Maps to `AI_AGENT` (weight: 85)
- **WARN** → Maps to `AI_EDITOR` (weight: 80)
- **LOG_ONLY** → No score impact

Dynamic policy rules are checked **before** the hardcoded blocklists, allowing operators to override default behavior.

---

## Score Recalculation

Scores are recalculated in two scenarios:

1. **New Telemetry Ingestion** — When an agent sends new process/network/resource data that triggers a new incident or refreshes an existing one.
2. **Incident Review** — When a Proctor dismisses or reviews an incident via the Dashboard, the score is immediately recalculated using only `OPEN` (non-dismissed) incidents.

### Deduplication
If an `OPEN` incident of the same `indicator_type` already exists for a contestant, the existing incident is **refreshed** (timestamp updated) rather than creating a duplicate. This prevents score inflation from repeated detections.

### Score Persistence
New `IntegrityScore` records are only written to the database when the score or level actually changes, preventing unnecessary database bloat.

---

## Worked Example

A contestant opens Cursor IDE and visits `api.openai.com`:

| Indicator | Weight | Age | Decay | Weighted Score |
|---|---|---|---|---|
| AI_EDITOR (Cursor) | 80 | 2 min | 1.0 | 80.0 |
| NETWORK_AI_CRITICAL (OpenAI) | 90 | 1 min | 1.0 | 90.0 |

```
Raw Score  = 80.0 + 90.0 = 170.0
Final Score = min(170, 100) = 100 → 🔴 RED
```

After 20 minutes with no further activity:

| Indicator | Weight | Age | Decay | Weighted Score |
|---|---|---|---|---|
| AI_EDITOR (Cursor) | 80 | 22 min | 0.4 | 32.0 |
| NETWORK_AI_CRITICAL (OpenAI) | 90 | 21 min | 0.4 | 36.0 |

```
Raw Score  = 32.0 + 36.0 = 68.0
Final Score = min(68, 100) = 68 → 🟡 YELLOW
```

If the Proctor then **dismisses** the AI_EDITOR incident:

```
Raw Score  = 36.0  (only OPEN incidents counted)
Final Score = 36 → 🟡 YELLOW
```

---

*Last updated: 2026-05-03*
