package main

import (
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/lockon/voight-agent/internal/watchdog"
)

// VOIGHT Watchdog — Secondary process that monitors the primary agent.
// Usage: voight-watchdog <agent-pid> [server-url]

func main() {
	log.SetPrefix("[VOIGHT-WATCHDOG] ")

	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "Usage: %s <agent-pid> [server-url]\n", os.Args[0])
		os.Exit(1)
	}

	agentPID, err := strconv.Atoi(os.Args[1])
	if err != nil {
		fmt.Fprintf(os.Stderr, "Invalid PID: %s\n", os.Args[1])
		os.Exit(1)
	}

	serverURL := ""
	if len(os.Args) >= 3 {
		serverURL = os.Args[2]
	}

	watchdog.RunStandalone(agentPID, serverURL)
}
