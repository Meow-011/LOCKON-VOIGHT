# Contributing to LOCKON VOIGHT

First off, thank you for considering contributing to LOCKON VOIGHT! It's people like you that make this open-source cybersecurity project better for everyone.

## Where to Start

If you are looking to contribute to the codebase, please ensure you have read the [README.md](README.md) to understand the project architecture and the Quick Start guide to set up your local development environment.

## How to Contribute

### Reporting Bugs
If you find a bug, please use the Bug Report issue template. Provide as much detail as possible, including your OS, Agent/Server version, and steps to reproduce the issue.

### Suggesting Enhancements
Have an idea for a new Anti-Cheat mechanism or dashboard feature? Please use the Feature Request issue template. We love discussing new ideas!

### Local Development

We have heavily automated the local development environment using PowerShell.
1. Run `.\start-dev.ps1` from the root directory to automatically launch the Postgres DB, Redis, run Python migrations, and start both the FastAPI backend and React dashboard.
2. If you make changes to the Go Agent (`agent/`), run `.\rebuild.ps1`. This uses `fyne-cross` to cross-compile the agent for Windows, Linux, and macOS and packages them into the `dashboard/public/downloads` folder automatically.

### Pull Requests
1. **Fork the repository** and create your branch from `main`.
2. **Write tests** if you are adding new backend functionality (we use `pytest`).
3. **Format your code**:
   - Backend (Python): Use `black` and `flake8`
   - Agent (Go): Use `gofmt`
   - Dashboard (React): Use `Prettier`
4. **Ensure the test suite passes**: Run `python -m pytest` in the `tests/` directory.
5. **eBPF Contributions**: If you are modifying the Linux eBPF memory forensics module (`agent/internal/ebpf`), please ensure you test your changes on a native Linux kernel (Ubuntu 20.04+ recommended) as macOS/Windows Docker cannot compile kernel hooks easily.
6. **Issue that PR!** Please provide a comprehensive description of the changes you made.

## Code Structure

- `agent/`: Go source code for the contestant endpoint monitor.
  - `internal/gui/`: Fyne desktop interface (screen lock, warnings).
  - `internal/ebpf/`: Linux kernel-level memory scanning modules.
- `server/`: FastAPI Python backend and Celery/Redis scoring engine.
- `dashboard/`: React + Vite frontend for the Proctor control panel.
- `shared/`: Shared JSON schemas and detection rules (so Agent and Server are always aligned).
- `deploy/`: Production Docker Compose configurations and mTLS certificate scripts.

We welcome contributions across all these stacks!
