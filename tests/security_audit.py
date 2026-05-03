"""
LOCKON VOIGHT — Anti-Tamper & Evasion Test Matrix (Tasks 5.3 & 5.4)
Documents test scenarios for manual execution during security audit.

Usage:
    python tests/security_audit.py
"""


def print_test_matrix():
    print("╔══════════════════════════════════════════════════════════╗")
    print("║  LOCKON VOIGHT — Security Audit Test Matrix              ║")
    print("║  Tasks 5.3 (Anti-Tamper) & 5.4 (Evasion) & 5.5 (PDPA)  ║")
    print("╚══════════════════════════════════════════════════════════╝\n")

    # Anti-Tamper Tests (Task 5.3)
    print("═══════════════════════════════════════════════")
    print("  5.3 — ANTI-TAMPER TESTS")
    print("═══════════════════════════════════════════════\n")

    tamper_tests = [
        {
            "id": "AT-01",
            "name": "Kill Agent Process",
            "action": "taskkill /F /IM voight-sentinel.exe",
            "expected": [
                "Watchdog detects termination within 9 seconds (3 × 3s)",
                "Server receives HEARTBEAT_TIMEOUT incident",
                "Dashboard shows contestant as OFFLINE with RED score",
            ],
        },
        {
            "id": "AT-02",
            "name": "Modify Agent Binary",
            "action": "Append random bytes to voight-sentinel.exe while running",
            "expected": [
                "Integrity checker detects hash mismatch within 60 seconds",
                "BINARY_TAMPER incident created (weight: 100)",
                "Score immediately reaches 100 (RED/ALERT)",
            ],
        },
        {
            "id": "AT-03",
            "name": "Replace Agent with Fake",
            "action": "Kill agent, replace binary, restart",
            "expected": [
                "New binary hash differs from enrolled hash",
                "Server rejects heartbeats with mismatched hash",
                "BINARY_TAMPER + HEARTBEAT_TIMEOUT incidents created",
            ],
        },
        {
            "id": "AT-04",
            "name": "Suspend Agent (SIGSTOP)",
            "action": "Suspend process via debugger or task manager",
            "expected": [
                "Heartbeat times out after 30 seconds",
                "HEARTBEAT_TIMEOUT incident created",
                "Contestant marked as OFFLINE",
            ],
        },
        {
            "id": "AT-05",
            "name": "Block gRPC Port",
            "action": "Firewall rule blocking outbound port 50051",
            "expected": [
                "Agent retries connection (3 consecutive failures)",
                "Watchdog HTTP fallback alert fires",
                "Server detects heartbeat timeout",
            ],
        },
    ]

    for test in tamper_tests:
        print(f"  [{test['id']}] {test['name']}")
        print(f"  Action: {test['action']}")
        print(f"  Expected:")
        for exp in test['expected']:
            print(f"    → {exp}")
        print(f"  Result: [ ] PASS  [ ] FAIL")
        print()

    # Evasion Tests (Task 5.4)
    print("═══════════════════════════════════════════════")
    print("  5.4 — EVASION TESTS")
    print("═══════════════════════════════════════════════\n")

    evasion_tests = [
        {
            "id": "EV-01",
            "name": "Renamed AI Process",
            "action": "Rename 'ollama.exe' to 'svchost.exe' and run",
            "expected": [
                "Cmdline-based detection catches '--model' arguments",
                "Agent checks /cmdline content, not just process name",
                "Incident created despite renamed binary",
            ],
        },
        {
            "id": "EV-02",
            "name": "VPN/Proxy AI Access",
            "action": "Route api.openai.com traffic through VPN tunnel",
            "expected": [
                "Agent monitors system DNS resolver (before VPN encryption)",
                "PROXY_VPN indicator may fire for VPN process detection",
                "Network monitoring may miss tunneled traffic (known limitation)",
            ],
        },
        {
            "id": "EV-03",
            "name": "Browser-Based AI",
            "action": "Access chat.openai.com via browser",
            "expected": [
                "Network monitor detects DNS resolution for chat.openai.com",
                "NETWORK_AI_CRITICAL incident created",
                "Browser process itself is not flagged (only network connection)",
            ],
        },
        {
            "id": "EV-04",
            "name": "AI in Docker Container",
            "action": "Run 'docker run ollama/ollama' inside the VM",
            "expected": [
                "Process monitor detects docker/containerd with ollama image",
                "GPU/VRAM monitor detects high GPU usage from container",
                "File scanner detects model files in docker volumes",
            ],
        },
        {
            "id": "EV-05",
            "name": "SSH Tunnel to External AI",
            "action": "ssh -L 8080:api.openai.com:443 remote-server",
            "expected": [
                "Agent detects SSH process with port-forwarding arguments",
                "Connections to localhost:8080 are harder to detect (known gap)",
                "Resource monitor may catch unusual network patterns",
            ],
        },
    ]

    for test in evasion_tests:
        print(f"  [{test['id']}] {test['name']}")
        print(f"  Action: {test['action']}")
        print(f"  Expected:")
        for exp in test['expected']:
            print(f"    → {exp}")
        print(f"  Result: [ ] PASS  [ ] FAIL  [ ] KNOWN LIMITATION")
        print()

    # Privacy Compliance (Task 5.5)
    print("═══════════════════════════════════════════════")
    print("  5.5 — PRIVACY COMPLIANCE CHECKLIST (PDPA)")
    print("═══════════════════════════════════════════════\n")

    privacy_checks = [
        ("PC-01", "No keystroke logging", "Agent does NOT capture individual keystrokes"),
        ("PC-02", "No screen capture", "Agent does NOT take screenshots or record screen"),
        ("PC-03", "No file content reading", "File scanner only checks name/size/extension, NOT content"),
        ("PC-04", "Process names only", "Agent captures process name & cmdline, NOT memory contents"),
        ("PC-05", "Data retention policy", "Time-series data auto-deleted per DATA_RETENTION_DAYS config"),
        ("PC-06", "TLS encryption", "All agent→server communication uses TLS 1.3 (mTLS)"),
        ("PC-07", "Consent mechanism", "Agent only activates with explicit enrollment token"),
        ("PC-08", "Right to deletion", "Competition deletion cascades all contestant data"),
        ("PC-09", "Data minimization", "Only metadata (not payloads) collected for network events"),
        ("PC-10", "Access control", "JWT auth with role-based access (admin/proctor)"),
    ]

    for check_id, name, desc in privacy_checks:
        print(f"  [{check_id}] {name}")
        print(f"    Description: {desc}")
        print(f"    Compliance: [ ] PASS  [ ] FAIL  [ ] N/A")
        print()


if __name__ == "__main__":
    print_test_matrix()
