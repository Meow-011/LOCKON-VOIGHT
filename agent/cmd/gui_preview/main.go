package main

import (
	"context"
	"time"

	"github.com/lockon/voight-agent/internal/config"
	"github.com/lockon/voight-agent/internal/gui"
)

func main() {
	cfg := config.DefaultConfig()
	
	// Create a dummy cancel function
	ctx, cancel := context.WithCancel(context.Background())
	_ = ctx // Fix unused variable
	defer cancel()

	// Initialize the GUI without a real gRPC client
	appGUI := gui.NewAppGUI(cfg, nil, cancel)

	// Simulate connection after 2 seconds
	go func() {
		time.Sleep(2 * time.Second)
		appGUI.UpdateStatus(true, "Mock_Contestant")
		appGUI.UpdateScore(0) // Mock 0 AI score (SECURE)
		
		time.Sleep(3 * time.Second)
		appGUI.StartWarningCountdown(15) // Trigger warning lock countdown (15s mock)
	}()

	// Run the Fyne app directly (this will pop up instantly)
	appGUI.Run()
}
