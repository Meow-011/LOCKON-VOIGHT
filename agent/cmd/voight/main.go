package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/lockon/voight-agent/internal/config"
	"github.com/lockon/voight-agent/internal/ebpf"
	"github.com/lockon/voight-agent/internal/enrollment"
	"github.com/lockon/voight-agent/internal/gui"
	"github.com/lockon/voight-agent/internal/gui/assets"
	"github.com/lockon/voight-agent/internal/grpcclient"
	"github.com/lockon/voight-agent/internal/heartbeat"
	"github.com/lockon/voight-agent/internal/integrity"
	"github.com/lockon/voight-agent/internal/monitor"
	"github.com/lockon/voight-agent/internal/screen"
	"github.com/lockon/voight-agent/internal/sysutil"
	pb "github.com/lockon/voight-agent/proto/voight"
)

// LOCKON VOIGHT Agent — The Sentinel
// AI Detection & Proctoring Agent for contestant machines

const (
	AppName    = "VOIGHT Sentinel"
	AppVersion = "2.1.4"
)

func main() {
	// Force dark theme for Fyne title bar
	os.Setenv("FYNE_THEME", "dark")

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

	// ─── Single Instance Lock ────────────────────────────
	// Bind to a local port to prevent multiple agents from running concurrently
	listener, err := net.Listen("tcp", "127.0.0.1:40999")
	if err != nil {
		// Port is already in use, which means another instance is running
		sysutil.ShowMessage("LOCKON VOIGHT Sentinel", "Agent is already running or loading!\n\nPlease check your system tray (bottom right) or wait a few seconds.")
		os.Exit(0)
	}
	defer listener.Close()

	// ─── Show Splash Screen ──────────────────────────────
	closeSplash := sysutil.ShowHTASplash(assets.CocktailBytes)

	// ─── Setup Logging ───────────────────────────────────
	log.SetPrefix("[VOIGHT] ")
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)

	printBanner()

	// ─── Administrator Privilege Check ───────────────────
	// if !privilege.IsAdmin() {
	// 	log.Println("VOIGHT Sentinel requires Administrator/Root privileges.")
	// 	log.Println("Attempting to elevate privileges...")
	// 	if err := privilege.Elevate(); err != nil {
	// 		log.Fatalf("Failed to elevate privileges: %v", err)
	// 	}
	// 	os.Exit(0) // Exit original process since elevated one was spawned
	// }

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

	// ─── Initialize gRPC Client ──────────────────────────
	grpcClient := grpcclient.NewClient(cfg)

	// ─── Initialize GUI ──────────────────────────────────
	os.Setenv("FYNE_THEME", "dark")
	appGUI := gui.NewAppGUI(cfg, grpcClient, cancel)
	appGUI.SetSplashCloser(closeSplash)

	// Start core processing in a background goroutine
	go startAgentCore(ctx, cfg, grpcClient, appGUI)

	// Run Fyne App on the Main Thread (Blocking)
	appGUI.Run()

	log.Println("VOIGHT Sentinel stopped.")
}

func startAgentCore(ctx context.Context, cfg *config.Config, grpcClient *grpcclient.Client, appGUI *gui.AppGUI) {
	// ─── Initialize Integrity Checker ────────────────────
	integrityChecker, err := integrity.NewChecker(func(expected, actual string) {
		log.Printf("[Monitor] BINARY TAMPER DETECTED! Expected: %s, Got: %s", expected, actual)
	})
	if err != nil {
		log.Printf("Warning: Could not initialize integrity checker: %v", err)
	}

	if cfg.ServerAddress != "" {
		if err := grpcClient.Connect(ctx); err != nil {
			log.Printf("Warning: Could not connect to server: %v", err)
			log.Println("Agent will run in offline mode and retry connection...")
			appGUI.UpdateStatus(false)
		}
	}
	defer grpcClient.Close()

	// ─── Enrollment ──────────────────────────────────────
	if cfg.CompetitionKey != "" && cfg.TeamName != "" && cfg.AgentID == "" {
		enrollMgr := enrollment.NewManager(cfg, func(
			ctx context.Context, token string, fp enrollment.MachineFingerprint, ver, hash string,
		) (*enrollment.EnrollmentResult, error) {
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
			appGUI.UpdateStatus(false)
		} else {
			appGUI.UpdateStatus(true)
		}
	} else if cfg.AgentID != "" {
		appGUI.UpdateStatus(true)
	} else {
		appGUI.UpdateStatus(false)
	}

	// ─── Fetch Global Policy ─────────────────────────────
	if cfg.ServerAddress != "" {
		if err := cfg.FetchGlobalPolicy(); err != nil {
			log.Printf("Warning: Failed to fetch global policy: %v (using local defaults)", err)
		}
		
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

	processMon := monitor.NewProcessMonitor(cfg, func(info monitor.ProcessInfo) {
		log.Printf("[Monitor] AI Process Detected: %s (PID: %d, Category: %s)", info.Name, info.PID, info.Category)
		grpcClient.SendProcessSnapshot(ctx, cfg.ContestantID, []monitor.ProcessInfo{info})
	})
	go processMon.Run(ctx)

	networkMon := monitor.NewNetworkMonitor(cfg, func(event monitor.NetworkEvent) {
		log.Printf("[Network] AI Connection: %s -> %s:%d (%s)", event.DstDomain, event.DstIP, event.DstPort, event.Verdict)
		grpcClient.SendNetworkEvent(ctx, cfg.ContestantID, event)
	})
	go networkMon.Run(ctx)

	resourceMon := monitor.NewResourceMonitor(cfg, func(snapshot monitor.ResourceSnapshot, reason string) {
		grpcClient.SendResourceSnapshot(ctx, cfg.ContestantID, snapshot)
	})
	go resourceMon.Run(ctx)

	fileScanner := monitor.NewFileScanner(cfg, func(alert monitor.FileAlert) {
		grpcClient.SendFileAlert(ctx, cfg.ContestantID, alert)
	})
	go fileScanner.ScanOnce(ctx)

	memScanner := monitor.NewMemoryScanner(cfg, func(finding monitor.MemoryFinding) {
		grpcClient.SendMemoryFinding(ctx, cfg.ContestantID, finding)
	})
	if memScanner.IsAvailable() {
		go memScanner.Run(ctx)
	}

	ebpfMon := ebpf.New(cfg,
		func(pid int32, comm, filename string, ts time.Time) {
			category := classifyBinaryPath(filename, cfg)
			if category != "" {
				grpcClient.SendEbpfAlert(ctx, cfg.ContestantID, "EXEC", comm, pid, filename, category)
				if memScanner.IsAvailable() {
					go memScanner.ScanProcess(ctx, pid)
				}
			}
		},
		func(pid int32, comm string, dstIP string, dstPort uint16, ts time.Time) {},
		func(pid int32, comm, filename string, ts time.Time) {
			if isModelFile(filename) {
				grpcClient.SendEbpfAlert(ctx, cfg.ContestantID, "FILE_OPEN", comm, pid, filename, "MODEL_FILE")
			}
		},
	)
	if ebpfMon.IsAvailable() {
		go ebpfMon.Run(ctx)
	}

	if integrityChecker != nil {
		go integrityChecker.RunPeriodicCheck(ctx, 60*time.Second)
	}

	hbManager := heartbeat.NewManager(cfg, integrityChecker,
		func(ctx context.Context, agentID, contestantID, version, binaryHash string) (int, bool, bool, *pb.AgentConfig, error) {
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
		func(startCountdown bool) {
			if startCountdown {
				appGUI.StartWarningCountdown(30)
			}
		},
	)
	
	screenBroadcaster := screen.NewBroadcaster()
	screenBroadcaster.SetEnabled(true)
	screenBroadcaster.StartBroadcasting(ctx, func(data []byte) error {
		if cfg.ContestantID == "" {
			return nil // Skip if not enrolled yet
		}
		url := fmt.Sprintf("http://%s:8000/api/screen/upload/%s", cfg.ServerAddress, cfg.ContestantID)
		if cfg.UseTLS && cfg.ServerAddress != "localhost" && cfg.ServerAddress != "127.0.0.1" {
			url = fmt.Sprintf("https://%s/api/screen/upload/%s", cfg.ServerAddress, cfg.ContestantID)
		}
		
		client := &http.Client{Timeout: 3 * time.Second}
		resp, err := client.Post(url, "image/jpeg", bytes.NewReader(data))
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			return fmt.Errorf("bad status: %d", resp.StatusCode)
		}
		return nil
	})

	go hbManager.Run(ctx)

	log.Println("  All modules running. Monitoring active.")
	
	<-ctx.Done()
	log.Println("Shutting down core gracefully...")
	time.Sleep(500 * time.Millisecond) 
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

// classifyBinaryPath checks if a binary path belongs to a known AI tool.
// Returns the category ("AI_EDITOR", "LOCAL_LLM", "AI_AGENT") or "" if not AI-related.
func classifyBinaryPath(path string, cfg *config.Config) string {
	lower := strings.ToLower(path)

	// Check against configured AI process names
	for _, name := range cfg.AIProcessNames {
		if strings.Contains(lower, strings.ToLower(name)) {
			// Categorize based on known tool types
			switch {
			case strings.Contains(lower, "cursor") || strings.Contains(lower, "windsurf") ||
				strings.Contains(lower, "aide") || strings.Contains(lower, "tabnine"):
				return "AI_EDITOR"
			case strings.Contains(lower, "ollama") || strings.Contains(lower, "lm-studio") ||
				strings.Contains(lower, "llama") || strings.Contains(lower, "vllm"):
				return "LOCAL_LLM"
			case strings.Contains(lower, "autogpt") || strings.Contains(lower, "opendevin") ||
				strings.Contains(lower, "aider"):
				return "AI_AGENT"
			default:
				return "LOCAL_LLM" // Default AI classification
			}
		}
	}
	return ""
}

// isModelFile checks if a filename has a known AI model file extension.
func isModelFile(filename string) bool {
	lower := strings.ToLower(filename)
	modelExts := []string{".gguf", ".ggml", ".safetensors", ".onnx", ".pth"}
	for _, ext := range modelExts {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	return false
}
