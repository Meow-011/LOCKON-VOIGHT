package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/lockon/voight-agent/internal/config"
	"github.com/lockon/voight-agent/internal/enrollment"
	"github.com/lockon/voight-agent/internal/grpcclient"
	"github.com/lockon/voight-agent/internal/heartbeat"
	"github.com/lockon/voight-agent/internal/integrity"
	"github.com/lockon/voight-agent/internal/monitor"
	"github.com/lockon/voight-agent/internal/privilege"
	pb "github.com/lockon/voight-agent/proto/voight"
)

// LOCKON VOIGHT Agent — The Sentinel
// AI Detection & Proctoring Agent for contestant machines

const (
	AppName    = "VOIGHT Sentinel"
	AppVersion = "0.1.0"
)

func main() {
	// ─── Parse CLI Flags ─────────────────────────────────
	configPath := flag.String("config", "config.json", "Path to agent config file (JSON)")
	tokenFlag := flag.String("token", "", "Enrollment token (overrides config)")
	serverFlag := flag.String("server", "", "Server address (overrides config)")
	noTLS := flag.Bool("no-tls", false, "Disable TLS (development only)")
	version := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *version {
		fmt.Printf("%s v%s\n", AppName, AppVersion)
		os.Exit(0)
	}

	// ─── Setup Logging ───────────────────────────────────
	log.SetPrefix("[VOIGHT] ")
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)

	printBanner()

	if !privilege.IsAdmin() {
		log.Printf("VOIGHT Sentinel requires Administrator/Root privileges.")
		log.Printf("Attempting to elevate privileges...")
		err := privilege.Elevate()
		if err != nil {
			log.Fatalf("CRITICAL ERROR: Failed to elevate privileges (%v). Please run as Administrator/root.", err)
		}
		// The elevated process will start in a new window. We exit this one.
		os.Exit(0)
	}

	// ─── Load Configuration ──────────────────────────────
	cfg := config.DefaultConfig()

	if *configPath != "" {
		var err error
		cfg, err = config.LoadFromFile(*configPath)
		if err != nil {
			log.Printf("Warning: Could not load config from %s: %v (using defaults)", *configPath, err)
			cfg = config.DefaultConfig()
		}
	}

	// Apply CLI overrides
	if *tokenFlag != "" {
		cfg.CompetitionKey = *tokenFlag
	}
	if *serverFlag != "" {
		cfg.ServerAddress = *serverFlag
	}
	if *noTLS {
		cfg.UseTLS = false
	}

	cfg.Initialize()

	// ─── Context with Graceful Shutdown ──────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle OS signals for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigChan
		log.Printf("Received signal: %v — initiating graceful shutdown...", sig)
		cancel()
	}()

	// ─── Initialize Integrity Checker ────────────────────
	integrityChecker, err := integrity.NewChecker(func(expected, actual string) {
		log.Printf("[Monitor] BINARY TAMPER DETECTED! Expected: %s, Got: %s", expected, actual)
		// In production, this would immediately send a tamper alert to the server
	})
	if err != nil {
		log.Printf("Warning: Could not initialize integrity checker: %v", err)
	}

	// ─── Initialize gRPC Client ──────────────────────────
	grpcClient := grpcclient.NewClient(cfg)

	if cfg.ServerAddress != "" {
		if err := grpcClient.Connect(ctx); err != nil {
			log.Printf("Warning: Could not connect to server: %v", err)
			log.Println("Agent will run in offline mode and retry connection...")
		}
	}
	defer grpcClient.Close()

	// ─── Enrollment ──────────────────────────────────────
	if cfg.CompetitionKey != "" && cfg.TeamName != "" && cfg.AgentID == "" {
		enrollMgr := enrollment.NewManager(cfg, func(
			ctx context.Context, token string, fp enrollment.MachineFingerprint, ver, hash string,
		) (*enrollment.EnrollmentResult, error) {
			// Wire to actual gRPC enrollment call
			// Send CompetitionKey::TeamName::ContestantName as the token
			compoundToken := cfg.CompetitionKey + "::" + cfg.TeamName
			if cfg.ContestantName != "" {
				compoundToken += "::" + cfg.ContestantName
			}
			log.Printf("[Enrollment] Sending self-enrollment token to server...")
			respInterface, err := grpcClient.Enroll(ctx, compoundToken, fp, ver, hash)
			if err != nil {
				return nil, err
			}
			
			pbResp, ok := respInterface.(*pb.EnrollmentResponse)
			if !ok {
				return nil, fmt.Errorf("unexpected response type from Enroll")
			}
			
			if !pbResp.Success {
				return nil, fmt.Errorf("server rejected enrollment: %s", pbResp.Message)
			}

			return &enrollment.EnrollmentResult{
				AgentID:       pbResp.AgentId,
				ContestantID:  pbResp.ContestantId,
				CompetitionID: pbResp.CompetitionId,
			}, nil
		})

		binaryHash := ""
		if integrityChecker != nil {
			binaryHash = integrityChecker.GetStartupHash()
		}

		if _, err := enrollMgr.Enroll(ctx, binaryHash); err != nil {
			log.Printf("Enrollment failed: %v", err)
			log.Println("Agent will continue without enrollment. Some features may be limited.")
		}
	}

	// ─── Fetch Global Policy ─────────────────────────────
	if cfg.ServerAddress != "" {
		log.Printf("Fetching global detection policy from %s...", cfg.ServerAddress)
		if err := cfg.FetchGlobalPolicy(); err != nil {
			log.Printf("Warning: Failed to fetch global policy: %v (using local defaults)", err)
		} else {
			log.Printf("Successfully loaded global policy (%d domains, %d processes, %d extensions)", 
				len(cfg.AIDomains), len(cfg.AIProcessNames), len(cfg.ModelFileExtensions))
		}
		
		// Start background policy updater
		go func() {
			ticker := time.NewTicker(60 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					if err := cfg.FetchGlobalPolicy(); err != nil {
						log.Printf("[Policy] Failed to update policy: %v", err)
					}
				}
			}
		}()
	}

	// ─── Start Monitors ──────────────────────────────────
	log.Println("═══════════════════════════════════════════")
	log.Println("  Starting monitoring modules...")
	log.Println("═══════════════════════════════════════════")

	// Process Monitor (Task 2.1)
	processMon := monitor.NewProcessMonitor(cfg, func(info monitor.ProcessInfo) {
		log.Printf("[Monitor] AI Process Detected: %s (PID: %d, Category: %s)",
			info.Name, info.PID, info.Category)
		// Send to server via gRPC
		grpcClient.SendProcessSnapshot(ctx, cfg.ContestantID, []monitor.ProcessInfo{info})
	})
	go processMon.Run(ctx)

	networkMon := monitor.NewNetworkMonitor(cfg, func(event monitor.NetworkEvent) {
		log.Printf("[Network] AI Connection: %s -> %s:%d (%s)",
			event.DstDomain, event.DstIP, event.DstPort, event.Verdict)
		grpcClient.SendNetworkEvent(ctx, cfg.ContestantID, event)
	})
	go networkMon.Run(ctx)

	resourceMon := monitor.NewResourceMonitor(cfg, func(snapshot monitor.ResourceSnapshot, reason string) {
		if reason != "" {
			log.Printf("[Resource] Anomaly: %s", reason)
		}
		grpcClient.SendResourceSnapshot(ctx, cfg.ContestantID, snapshot)
	})
	go resourceMon.Run(ctx)

	fileScanner := monitor.NewFileScanner(cfg, func(alert monitor.FileAlert) {
		log.Printf("[FileScanner] Model File Detected: %s (%.1f MB, %s)",
			alert.FileName, alert.FileSizeMB, alert.FileType)
		grpcClient.SendFileAlert(ctx, cfg.ContestantID, alert)
	})
	go fileScanner.ScanOnce(ctx)

	// Integrity Periodic Check (Task 2.5)
	if integrityChecker != nil {
		go integrityChecker.RunPeriodicCheck(ctx, 60*time.Second)
	}

	// Heartbeat (Task 2.5)
	hbManager := heartbeat.NewManager(cfg, integrityChecker,
		func(ctx context.Context, agentID, contestantID, version, binaryHash string) (int, bool, *pb.AgentConfig, error) {
			return grpcClient.SendHeartbeat(ctx, agentID, contestantID, version, binaryHash)
		},
		func(configUpdate *pb.AgentConfig) {
			if configUpdate != nil {
				if len(configUpdate.AdditionalAiProcesses) > 0 {
					cfg.AIProcessNames = configUpdate.AdditionalAiProcesses
				}
				if len(configUpdate.AdditionalAiDomains) > 0 {
					cfg.AIDomains = configUpdate.AdditionalAiDomains
				}
			}
		},
	)
	go hbManager.Run(ctx)

	log.Println("═══════════════════════════════════════════")
	log.Println("  All modules running. Monitoring active.")
	log.Println("  Press Ctrl+C to stop.")
	log.Println("═══════════════════════════════════════════")

	// ─── Wait for Shutdown ───────────────────────────────
	<-ctx.Done()

	log.Println("Shutting down gracefully...")
	time.Sleep(500 * time.Millisecond) // Allow goroutines to clean up
	log.Println("VOIGHT Sentinel stopped.")
}

// printBanner displays the agent startup banner.
func printBanner() {
	// ANSI Color Codes for Tactical Terminal
	colorReset := "\033[0m"
	colorRed := "\033[31m"
	colorCyan := "\033[36m"
	colorGray := "\033[90m"
	colorWhite := "\033[97m"
	colorPink := "\033[95m"

	banner := colorPink + `
 ⣿⠛⠛⠛⠛⠻⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
 ⠛⢛⣿⠋⢀⡾⠃⠀⠀⠀⠀⢀⣤⣤⠤⠤⣤⣤⣀⣀⣀⣠⠶⡶⣤⣀⣠⠾⡷⣦⣀⣤⣤⡤⠤⠦⢤⣤⣄⡀⠀⢠⡶⢶⡄⠀⠀
 ⢠⡟⠁⣴⣿⢤⡄⣴⢶⠶⡆⠈⢷⡀⠀⠀⠀⠀⢀⣭⣫⠵⠥⠽⣄⣝⠵⢍⣘⣄⠳⣤⣀⠀⠀⢀⡤⠊⣽⠁⠀⠸⣇⠀⢿⠀⠀
 ⠸⢷⣴⣤⡤⠾⠇⣽⠋⠼⣷⠀⠈⢷⡄⢀⣤⡶⠋⠀⣀⡄⠤⠀⡲⡆⠀⠀⠈⠙⡄⠘⢮⢳⡴⠯⣀⢠⡏⠀⠀⠀⢻⠀⢸⠇⠀
 ⠀⠀⠀⠀⠀⠀⠀⠙⠛⠋⠉⢀⣴⠟⠉⢯⡞⡠⢲⠉⣼⠀⠀⡰⠁⡇⢀⢷⠀⣄⢵⠀⠈⡟⢄⠀⠀⠙⢷⣤⣤⣤⡿⢢⡿⠀⠀
 ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⠟⠑⠊⠁⡼⣌⢠⢿⢸⢸⡀⢰⠁⡸⡇⡸⣸⢰⢈⠘⡄⠀⢸⠀⢣⡀⠀⠈⢮⢢⣏⣤⡾⠃⠀⠀
 ⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⣯⣴⠞⡠⣼⠁⡘⣾⠏⣿⢇⣳⣸⣞⣀⢱⣧⣋⣞⡜⢳⡇⠀⢸⠀⢆⢧⠀⠰⣄⢏⢧⣾⠁⠀⠀⠀
 ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢹⡏⢰⠁⡻⠀⡟⡏⠉⠀⣀⠀⠀⠀⠀⣀⠁⠀⠉⠛⢽⠇⠀⣼⡆⠈⡆⠃⠀⡏⠻⣾⣽⣇⡀⠀⠀
 ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠁⡇⠀⡇⡄⣿⠷⠿⠿⠛⠀⠀⠀⠀⠛⠻⠿⠿⠿⡜⢀⡴⡟⢸⣸⡼⠀⠀⡇⠀⡞⡆⢻⠙⢦⠀
 ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⡶⢀⣼⣿⣬⣽⠧⠬⠇⠀⠀⠀⠀⠀⠀⢞⣯⣭⢺⣔⣪⣾⣤⠺⡇⢳⠀⢠⣧⡾⠛⠛⠻⠶⠞⠁
 ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⠷⢿⠟⠉⡀⠈⢦⡀⠀⠀⣠⠖⠒⠒⢤⡀⠀⢀⡼⠿⢇⡣⢬⣶⠷⢿⣤⡾⠁⠀⠀⠀⠀⠀⠀⠀
 ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⠷⠾⠷⠖⠛⠛⠲⠶⠿⠤⣤⠤⠤⢷⣶⠋⠀⠀⠀⣱⠞⠁⠀⠈⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀
 ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠛⠓⠒⠚⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀` + colorCyan + `
   _____       ___      ______  ___  ____    ___   ____  _____  
  |_   _|    .'   '.  .' ___  ||_  ||_  _| .'   '.|_   \|_   _| 
    | |     /  .-.  \/ .'   \_|  | |_/ /  /  .-.  \ |   \ | |   
    | |   _ | |   | || |         |  __'.  | |   | | | |\ \| |   
   _| |__/ |\  '-'  /\ '.___.'\ _| |  \ \_\  '-'  /_| |_\   |_  
  |________| '.___.'  '.____ .'|____||____|'.___.'|_____|\____| 
  ____   ____   ___   _____   ______  ____  ____  _________     
 |_  _| |_  _|.'   '.|_   _|.' ___  ||_   ||   _||  _   _  |    
   \ \   / / /  .-.  \ | | / .'   \_|  | |__| |  |_/ | | \_|    
    \ \ / /  | |   | | | | | |   ____  |  __  |      | |        
     \ ' /   \  '-'  /_| |_\ '.___]  |_| |  | |_    _| |_       
      \_/     '.___.'|_____|'._____.'|____||____|  |_____|
` + colorGray + `
  [SYS.ID]      ` + colorWhite + `LOCKON-VOIGHT // 
` + colorGray + `  [PROTOCOL]    ` + colorWhite + `INTEGRITY ENFORCEMENT
` + colorGray + `  [VERSION]     ` + colorWhite + `v%s
` + colorGray + `  [STATUS]      ` + colorRed + `GHOST HUNTING MODE : ACTIVE` + colorReset + `

`
	fmt.Printf(banner, AppVersion)
}

