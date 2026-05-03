"""
LOCKON VOIGHT — Load Testing Script (Task 5.1)
Simulates 500+ concurrent agents sending telemetry data.

Usage:
    pip install aiohttp
    python tests/load_test.py --agents 500 --duration 60 --server http://localhost:8000
"""

import argparse
import asyncio
import json
import random
import time
import uuid
from datetime import datetime

import aiohttp

# AI process names for simulation
AI_PROCESSES = [
    "cursor", "ollama", "lm-studio", "code-gpt", "windsurf",
    "copilot-agent", "zed", "continue-server", "aider",
]
NORMAL_PROCESSES = [
    "chrome.exe", "firefox.exe", "python.exe", "node.exe",
    "cmd.exe", "explorer.exe", "vscode.exe", "notepad.exe",
    "powershell.exe", "git.exe", "ssh.exe", "curl.exe",
]


class SimulatedAgent:
    """Simulates a VOIGHT agent sending telemetry."""

    def __init__(self, agent_id: int, server_url: str, cheat_probability: float = 0.1):
        self.agent_id = f"agent-{agent_id:04d}"
        self.contestant_id = str(uuid.uuid4())
        self.server_url = server_url
        self.cheat_probability = cheat_probability
        self.total_requests = 0
        self.errors = 0

    async def run(self, session: aiohttp.ClientSession, duration: int):
        """Run the agent for the specified duration."""
        end_time = time.time() + duration

        while time.time() < end_time:
            try:
                await self.send_heartbeat(session)
                await self.send_processes(session)
                await self.send_resources(session)

                if random.random() < 0.3:  # 30% chance of network event
                    await self.send_network_event(session)

                self.total_requests += 4
            except Exception as e:
                self.errors += 1

            await asyncio.sleep(random.uniform(3, 8))

    async def send_heartbeat(self, session: aiohttp.ClientSession):
        await session.post(f"{self.server_url}/api/telemetry/heartbeat", json={
            "contestant_id": self.contestant_id,
            "agent_version": "0.1.0",
            "agent_binary_hash": "abc123def456",
        })

    async def send_processes(self, session: aiohttp.ClientSession):
        processes = []
        # Always include normal processes
        for _ in range(random.randint(5, 15)):
            processes.append({
                "name": random.choice(NORMAL_PROCESSES),
                "pid": random.randint(1000, 65535),
                "cmdline": "",
                "cpu_percent": random.uniform(0, 20),
                "memory_mb": random.uniform(10, 500),
                "category": "NORMAL",
            })

        # Cheating agents have AI processes
        if random.random() < self.cheat_probability:
            ai_proc = random.choice(AI_PROCESSES)
            processes.append({
                "name": ai_proc,
                "pid": random.randint(1000, 65535),
                "cmdline": f"/usr/bin/{ai_proc} serve",
                "cpu_percent": random.uniform(20, 80),
                "memory_mb": random.uniform(200, 4000),
                "category": random.choice(["AI_EDITOR", "LOCAL_LLM", "AI_AGENT"]),
            })

        await session.post(f"{self.server_url}/api/telemetry/processes", json={
            "contestant_id": self.contestant_id,
            "processes": processes,
        })

    async def send_resources(self, session: aiohttp.ClientSession):
        gpu = random.uniform(0, 30)
        vram = random.uniform(100, 2000)

        if random.random() < self.cheat_probability:
            gpu = random.uniform(70, 100)
            vram = random.uniform(4000, 16000)

        await session.post(f"{self.server_url}/api/telemetry/resources", json={
            "contestant_id": self.contestant_id,
            "cpu_percent": random.uniform(5, 60),
            "ram_percent": random.uniform(30, 80),
            "gpu_percent": gpu,
            "vram_mb": vram,
        })

    async def send_network_event(self, session: aiohttp.ClientSession):
        if random.random() < self.cheat_probability:
            domain = random.choice([
                "api.openai.com", "api.anthropic.com",
                "generativelanguage.googleapis.com",
            ])
            verdict = "AI_SERVICE"
        else:
            domain = random.choice([
                "github.com", "stackoverflow.com", "docs.python.org",
            ])
            verdict = "SAFE"

        await session.post(f"{self.server_url}/api/telemetry/network", json={
            "contestant_id": self.contestant_id,
            "dst_domain": domain,
            "dst_ip": f"{random.randint(1,255)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,255)}",
            "dst_port": 443,
            "protocol": "TCP",
            "verdict": verdict,
        })


async def run_load_test(num_agents: int, duration: int, server_url: str):
    """Execute the load test with the specified number of simulated agents."""
    print(f"╔════════════════════════════════════════════╗")
    print(f"║  LOCKON VOIGHT — Load Test                 ║")
    print(f"║  Agents: {num_agents:<5}  Duration: {duration}s          ║")
    print(f"║  Server: {server_url:<33}║")
    print(f"╚════════════════════════════════════════════╝")

    agents = [
        SimulatedAgent(i, server_url, cheat_probability=0.1 if i % 10 != 0 else 0.8)
        for i in range(num_agents)
    ]

    start = time.time()

    connector = aiohttp.TCPConnector(limit=100, limit_per_host=50)
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        tasks = [agent.run(session, duration) for agent in agents]
        await asyncio.gather(*tasks, return_exceptions=True)

    elapsed = time.time() - start
    total_requests = sum(a.total_requests for a in agents)
    total_errors = sum(a.errors for a in agents)
    rps = total_requests / elapsed if elapsed > 0 else 0

    print(f"\n{'=' * 50}")
    print(f"  RESULTS")
    print(f"{'=' * 50}")
    print(f"  Duration:        {elapsed:.1f}s")
    print(f"  Agents:          {num_agents}")
    print(f"  Total Requests:  {total_requests}")
    print(f"  Errors:          {total_errors}")
    print(f"  Error Rate:      {(total_errors / max(total_requests, 1)) * 100:.2f}%")
    print(f"  Requests/sec:    {rps:.1f}")
    print(f"  Avg per Agent:   {total_requests / num_agents:.1f} requests")
    print(f"{'=' * 50}")

    # Pass/Fail criteria
    error_rate = (total_errors / max(total_requests, 1)) * 100
    if error_rate < 1 and rps > 100:
        print(f"\n  ✅ PASS — System handled {num_agents} agents at {rps:.0f} req/s")
    elif error_rate < 5:
        print(f"\n  ⚠️  WARN — Error rate {error_rate:.1f}% is marginal")
    else:
        print(f"\n  ❌ FAIL — Error rate {error_rate:.1f}% exceeds threshold")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VOIGHT Load Testing")
    parser.add_argument("--agents", type=int, default=100, help="Number of simulated agents")
    parser.add_argument("--duration", type=int, default=60, help="Test duration in seconds")
    parser.add_argument("--server", type=str, default="http://localhost:8000", help="Server URL")
    args = parser.parse_args()

    asyncio.run(run_load_test(args.agents, args.duration, args.server))
