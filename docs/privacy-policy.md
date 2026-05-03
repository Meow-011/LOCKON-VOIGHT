# LOCKON VOIGHT — Privacy & Data Handling Policy

## Purpose
This document outlines the data collection, processing, and retention practices for the LOCKON VOIGHT Integrity Protocol system, in compliance with PDPA (Thai Personal Data Protection Act) and GDPR principles.

---

## Data Collection Principles

### What We Collect
The VOIGHT Agent collects **metadata only** — never content.

| Data Type | Collected | Details |
|---|---|---|
| Process names | ✅ | Process name and command-line arguments only |
| Process memory content | ❌ | Never accessed |
| Network connection metadata | ✅ | Destination IP, port, domain (via reverse DNS) |
| Network packet content | ❌ | No deep packet inspection |
| File names and sizes | ✅ | For known model file extensions only |
| File content | ❌ | Files are never opened or read |
| Keystrokes | ❌ | No keylogging of any kind |
| Screenshots | ❌ | No screen capture |
| Clipboard content | ❌ | Not accessed |
| Webcam/microphone | ❌ | Not accessed |
| CPU/RAM/GPU usage % | ✅ | System-level metrics only |
| Machine fingerprint | ✅ | Hostname, OS, CPU cores, RAM, MAC address |

### What We DON'T Collect
- ❌ Personal files or documents
- ❌ Browser history or cookies
- ❌ Email or messaging content
- ❌ Passwords or credentials
- ❌ Photos, videos, or audio
- ❌ Location data (GPS)
- ❌ Biometric data

---

## Legal Basis

### Consent
- The VOIGHT Agent requires an **explicit enrollment token** to activate
- Installation and enrollment constitute informed consent
- Contestants are informed of monitoring scope before participation
- Consent is voluntary — participation in the monitored competition implies acceptance

### Legitimate Interest
- Ensuring academic integrity and fair competition
- Preventing unauthorized tool usage during assessments
- Maintaining the credibility of competition results

---

## Data Processing

### Processing Location
- All data is processed on the competition organizer's infrastructure
- No data is sent to third-party services
- All communication uses TLS 1.3 encryption (mTLS between agent and server)

### Data Minimization
- Only the minimum necessary metadata is collected
- Process names are matched against a predefined AI tool list — non-matching processes are recorded but not flagged
- Network connections are classified by domain only

### Automated Decision-Making
- The **Integrity Score** is calculated automatically using the IoA Scoring Engine
- Automated scores are advisory — **human review is required** before any action
- Proctors can dismiss false positives, which immediately recalculates the score

---

## Data Retention

| Data Type | Retention Period | Deletion Method |
|---|---|---|
| Process logs (time-series) | Configurable (default: 90 days) | Automated Celery task |
| Network logs (time-series) | Configurable (default: 90 days) | Automated Celery task |
| Resource snapshots | Configurable (default: 90 days) | Automated Celery task |
| Heartbeat records | Configurable (default: 90 days) | Automated Celery task |
| Incidents | Preserved until competition archived | Manual or cascade delete |
| Integrity scores | Preserved until competition archived | Manual or cascade delete |
| Contestant profiles | Until competition deleted | Cascade delete |

### Right to Deletion
- Competition deletion cascades all related data (contestants, incidents, logs)
- Individual contestant data can be purged by removing the contestant record
- Automated cleanup runs hourly for expired time-series data

---

## Access Control

| Role | Permissions |
|---|---|
| **Admin** | Full access — manage proctors, competitions, all data |
| **Proctor** | View competitions, monitor contestants, review incidents |
| **Agent** | Write-only telemetry data via enrollment token |
| **Contestant** | No access to dashboard or data |

### Authentication
- JWT tokens with configurable expiration
- Refresh tokens for session continuity
- Agents authenticate via mTLS certificates (per-agent)

---

## Security Measures

1. **Encryption in transit** — TLS 1.3 for all communications
2. **Encryption at rest** — Database encryption (PostgreSQL native)
3. **Access control** — Role-based JWT authentication
4. **Audit trail** — All incidents include timestamps and reviewer identity
5. **Agent integrity** — SHA-256 binary self-verification
6. **Anti-tamper** — Watchdog process detects agent termination

---

## Compliance Statement

This system is designed to comply with:
- **PDPA** (Thailand Personal Data Protection Act, B.E. 2562)
- **GDPR** (General Data Protection Regulation) — data minimization and purpose limitation principles
- **ISO 27001** — information security management best practices

For questions about data handling, contact the competition organizer's Data Protection Officer (DPO).

---

*Last updated: 2026-05-03*
