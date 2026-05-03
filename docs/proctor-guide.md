# LOCKON VOIGHT — Proctor User Guide

## Overview

LOCKON VOIGHT is an AI Detection & Proctoring system designed for CTF competitions and skill assessments. As a **Proctor (Control Operator)**, you monitor contestants' machines in real-time to ensure no unauthorized AI tools are used during the event.

---

## Getting Started

### 1. Login
Navigate to the Dashboard URL (default: `http://localhost:5173`) and log in with your proctor credentials.

> If this is the first time accessing the system, you will be redirected to the **Initial Setup** page to create the primary administrator account.

### 2. Dashboard Overview
After login, you'll see the **LOCKON VOIGHT Command Dashboard** with:
- **Stats Cards** — Total agents, online count, active competitions, and live incident counters
- **Integrity Distribution** — Real-time breakdown of GREEN / YELLOW / RED nodes
- **Incident Trend** — Hourly chart of incidents over the last 24 hours
- **Threat Matrix** — Top 5 indicator types by frequency
- **Tactical Event Log** — Real-time stream of all security events

---

## Managing Competitions

### Create a Competition
1. Navigate to **COMPETITIONS** from the sidebar
2. Click **CREATE COMPETITION**
3. Enter the competition name, description, and optional start/end times
4. Upload a banner image (optional)
5. The competition starts in **Draft** status

### Activate a Competition
1. Open the competition detail view
2. Click the status dropdown → **Active**
3. This enables real-time monitoring and allows agents to enroll

### Status Lifecycle
```
Draft → Active → Completed → Archived
```

---

## Managing Contestants

### Self-Enrollment (Recommended)
Contestants can self-enroll by downloading the agent bundle from the public download page:
1. Navigate to `http://<SERVER_IP>:5173/download`
2. The agent auto-enrolls using the Global Competition Key
3. No manual token distribution required

### Manual Enrollment
1. Open a competition
2. Click **ADD CONTESTANT**
3. Enter handle and team (optional)
4. An **Enrollment Token** is auto-generated (e.g., `VGT-A1B2C3D4...`)
5. Share the token with the contestant

### Monitor Enrollment Status
- **Pending** — Token generated, agent not yet connected
- **Enrolled** — Agent connected and reporting
- **Online / Offline** — Real-time connection status (green/gray indicator)

---

## Fleet Command

The **Fleet Command** interface is your primary tactical overview for managing all connected Sentinel nodes.

### Node Table
Each node row displays:
- **Handle & Team** — Contestant identity
- **IP Address** — Agent's network address
- **OS** — Platform icon (Windows/Linux/macOS)
- **CPU / RAM** — Live resource utilization
- **Status** — ONLINE (green), WARNING (yellow), COMPROMISED (red), OFFLINE (gray)
- **Last Seen** — Time since last heartbeat

### Expandable Node Details
Click the chevron (▼) to expand a node and view:
- **Agent Version** — With OUTDATED warning if not the latest
- **Last Seen Exact** — Full ISO timestamp
- **Raw Fingerprint Data** — Hostname, OS version, architecture, CPU cores, total RAM, MAC address, IP

### Node Actions
| Icon | Action | Description |
|---|---|---|
| **Edit** | Modify handle or team name |
| **Delete** | Decommission the node (requires confirmation) |
| **Screen Lock** | Trigger a Tactical Screen Lock on the contestant's machine |
| **Detail View** | Navigate to the contestant's full telemetry page |

### Status Filtering
Use the **ALL STATUS** dropdown to filter nodes by: Online, Warning, Compromised, or Offline.

### Red Blinking Alert
Nodes with a `RED` or `CRITICAL` integrity level will blink red in the table. This stops automatically when incidents are resolved and the score decays back to GREEN.

---

## Detection Policy

The **Detection Policy** page lets you configure what the agents look for in real-time.

### Blocked Domains
Add domains that should trigger alerts (e.g., `api.openai.com`):
- **ESCALATE** — Triggers a CRITICAL alert (weight: 90)
- **WARN** — Triggers a HIGH alert (weight: 85)
- **LOG_ONLY** — Records the event without affecting the score

### Blocked Processes
Add process names that should be flagged (e.g., `cursor.exe`):
- Same action levels as domains

### Blocked File Extensions
Add file extensions associated with AI models (e.g., `.gguf`, `.safetensors`):
- Triggers alerts when matching files are found on the contestant's filesystem

Policy changes are pushed to all agents within **60 seconds** via the REST API, with a graceful fallback to gRPC heartbeats.

---

## System Configuration (Settings)

### Timing Controls
Adjust agent behavior from the Dashboard without restarting agents:
- **Scan Interval** — How frequently the agent scans processes and network (default: 10s)
- **Heartbeat Interval** — How often the agent sends a heartbeat (default: 5s)

Changes propagate to all connected agents in real-time.

### Competition Key
The Global Competition Key is used for agent self-enrollment. Change it here if needed.

### User Management
- Create additional Proctor accounts (Admin only)
- Manage roles and access

---

## Reading Integrity Scores

### Score Levels

| Level | Score | Meaning | Action |
|---|---|---|---|
| 🟢 **GREEN** | 0-29 | Clean — No AI indicators | No action needed |
| 🟡 **YELLOW** | 30-69 | Review — Suspicious activity | Investigate incidents |
| 🔴 **RED** | 70-100 | Alert — Strong AI evidence | Immediate review required |

### Score Behavior
- Scores are calculated from **OPEN** incidents only — dismissed incidents are excluded
- Indicators **decay over time** (full weight for 5 min → 10% after 30 min)
- The score badge pulses faster for higher severity levels

### What Affects the Score

| Indicator | Weight | Example |
|---|---|---|
| Binary Tamper | 100 | Agent binary modified |
| Heartbeat Lost | 95 | Agent killed/suspended |
| Local LLM | 90 | Ollama, LM Studio running |
| AI API (Critical) | 90 | api.openai.com connection |
| AI Agent | 85 | AutoGPT, OpenDevin |
| AI API (High) | 85 | api.deepseek.com connection |
| AI Editor | 80 | Cursor, Windsurf detected |
| Model File | 70 | .gguf, .safetensors found |
| AI Extension | 65 | Browser extension detected |
| VRAM Spike | 60 | >4GB VRAM sustained |
| GPU Spike | 50 | >80% GPU sustained |
| Proxy/VPN | 40 | VPN connection detected |

---

## Reviewing Incidents

### Incident Types
Incidents are auto-generated when the VOIGHT agent detects suspicious activity. Each incident includes:
- **Type** — The IoA category (color-coded by severity)
- **Weight** — How much it affects the integrity score
- **Evidence** — Technical details (process name, domain, file path)
- **Raw Data** — Structured JSON payload for deep inspection
- **Timestamp** — When it was detected

### Incident Actions

#### ✅ Review (Confirm)
- Marks the incident as reviewed and confirmed
- The weight remains in the score calculation
- Use when: You've verified the AI usage is genuine

#### ❌ Dismiss
- Removes the incident from score calculation
- The score is **immediately recalculated**
- Use when: False positive or authorized tool usage

### Deep Inspection
Click on any incident to open the **Detail Modal**. The raw evidence payload is displayed as structured JSON, showing the exact process paths, domain resolutions, or file locations that triggered the alert.

### Filtering
Use the toggle buttons to filter incidents:
- **Open** — Unreviewed incidents (default view)
- **Reviewed** — Confirmed incidents
- **Dismissed** — False positives / authorized

---

## Tactical Screen Lock

The Screen Lock is a full-screen overlay deployed to a contestant's machine as an immediate response to severe violations.

### How to Issue
1. Navigate to **Fleet Command**
2. Find the target node
3. Click the **Lock** icon in the Actions column

### What Happens
- An aggressive, full-screen overlay appears on the contestant's display (all monitors)
- The overlay displays a **SECURITY WARNING** with violation details
- The contestant must click **ACKNOWLEDGE VIOLATION** and wait through a **30-second countdown**
- During acknowledgement, the button turns tactical yellow (#EAB308)
- The window is hidden from the Taskbar and cannot be closed via Alt+F4 or right-click

### Screen Lock Counter
Each successful lock increments the contestant's `screen_lock_count`, which is visible in the Fleet Command and Contestant Detail views.

---

## Contestant Detail View

Click any contestant name to see their **Detail View**:

### Resource Chart
- Real-time CPU, GPU, and RAM usage graph
- GPU spikes above 80% may indicate local LLM inference

### Info Cards
- Agent version, enrollment time, last seen, open incident count

### Incident Timeline
- Chronological list of all incidents for this contestant
- Color-coded by severity with evidence details

---

## Best Practices

### Before the Competition
1. Create the competition and set the Competition Key
2. Configure Detection Policy (blocked domains, processes, file extensions)
3. Set scan and heartbeat intervals in System Configuration
4. Distribute the agent download link to contestants
5. Verify all agents are enrolled and online in Fleet Command
6. Set competition status to **Active**

### During the Competition
1. Monitor **Fleet Command** for RED/blinking nodes
2. Watch the **Tactical Event Log** on the Dashboard for new alerts
3. Review incidents promptly — check evidence and raw data
4. Issue Screen Locks for severe violations
5. Add review notes for documentation

### After the Competition
1. Review all remaining open incidents
2. Set competition status to **Completed**
3. Data is retained per the configured retention period (default: 90 days)

---

## FAQ

**Q: Can contestants see their own score?**
A: No. The agent runs silently with no GUI (headless mode). Only proctors see scores on the Dashboard.

**Q: What if an agent disconnects during the competition?**
A: A `HEARTBEAT_TIMEOUT` incident is auto-generated after 30 seconds (IoA weight: 95). The watchdog process attempts to restart the agent and alert the server.

**Q: Does the agent capture keystrokes or screenshots?**
A: Absolutely not. The agent only monitors process names, network connections (domain metadata only), and resource usage. No content is ever captured. See the [Privacy Policy](privacy-policy.md) for details.

**Q: Can I adjust scoring weights?**
A: The IoA weight table is in `server/app/scoring/engine.py`. Modify the `IOA_WEIGHTS` dictionary to customize weights per your policy. Score thresholds can be adjusted via environment variables without code changes.

**Q: How do I handle false positives?**
A: Click **Dismiss** on the incident and add a note explaining why. The score will be recalculated immediately, and the node will stop blinking red once the score drops below the RED threshold.

**Q: Why does the agent log "Failed to update policy: status 403"?**
A: This is expected behavior. The REST API policy endpoint requires authentication that the agent doesn't have. The agent gracefully falls back to receiving policy updates via the gRPC heartbeat channel instead.

---

*Last updated: 2026-05-03*
