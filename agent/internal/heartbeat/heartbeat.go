// Package heartbeat implements the periodic check-in mechanism for the VOIGHT Agent.
// The server uses heartbeats to detect agent tampering or termination.
package heartbeat

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"github.com/lockon/voight-agent/internal/config"
	"github.com/lockon/voight-agent/internal/integrity"
	pb "github.com/lockon/voight-agent/proto/voight"
)

// Status represents the current heartbeat status.
type Status struct {
	LastSent     time.Time `json:"last_sent"`
	LastAck      time.Time `json:"last_ack"`
	Consecutive  int       `json:"consecutive_success"`
	Failures     int       `json:"consecutive_failures"`
	IsHealthy    bool      `json:"is_healthy"`
}

// SendFunc is the function signature for sending heartbeats to the server.
// Returns the server-suggested heartbeat interval (0 = no change), deploy warning flag, configUpdate, or error.
type SendFunc func(ctx context.Context, agentID, contestantID, version, binaryHash string) (int, bool, *pb.AgentConfig, error)

// Manager handles periodic heartbeat check-ins with the server.
type Manager struct {
	cfg       *config.Config
	checker   *integrity.Checker
	sendFn    SendFunc
	onConfig  func(*pb.AgentConfig)
	mu        sync.RWMutex
	status    Status
	interval  time.Duration
}

// NewManager creates a new heartbeat manager.
func NewManager(cfg *config.Config, checker *integrity.Checker, sendFn SendFunc, onConfig func(*pb.AgentConfig)) *Manager {
	return &Manager{
		cfg:      cfg,
		checker:  checker,
		sendFn:   sendFn,
		onConfig: onConfig,
		interval: cfg.HeartbeatInterval,
		status: Status{
			IsHealthy: true,
		},
	}
}

// Run starts the heartbeat loop. It sends check-ins at the configured interval
// and includes the agent's self-integrity hash for tamper detection.
func (m *Manager) Run(ctx context.Context) {
	log.Printf("[Heartbeat] Starting heartbeat (interval: %v)...", m.interval)

	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[Heartbeat] Stopping.")
			return
		case <-ticker.C:
			m.sendHeartbeat(ctx)

			// Check if server adjusted the interval
			m.mu.RLock()
			currentInterval := m.interval
			m.mu.RUnlock()

			if currentInterval != m.cfg.HeartbeatInterval {
				ticker.Reset(currentInterval)
			}
		}
	}
}

// sendHeartbeat sends a single heartbeat to the server.
func (m *Manager) sendHeartbeat(ctx context.Context) {
	// Get current binary hash for integrity verification
	binaryHash := ""
	if m.checker != nil {
		binaryHash = m.checker.GetCurrentHash()
	}

	now := time.Now()

	// Call the send function (injected gRPC call)
	newInterval, deployWarning, configUpdate, err := m.sendFn(
		ctx,
		m.cfg.AgentID,
		m.cfg.ContestantID,
		"0.1.0",
		binaryHash,
	)

	m.mu.Lock()
	defer m.mu.Unlock()

	m.status.LastSent = now

	if err != nil {
		m.status.Failures++
		m.status.Consecutive = 0
		m.status.IsHealthy = m.status.Failures < 3 // Allow up to 2 failures

		if m.status.Failures >= 3 {
			log.Printf("[Heartbeat] Server unreachable for %d consecutive attempts!", m.status.Failures)
		} else {
			log.Printf("[Heartbeat] Send failed: %v (failures: %d)", err, m.status.Failures)
		}
		return
	}

	// Success
	m.status.LastAck = time.Now()
	m.status.Consecutive++
	m.status.Failures = 0
	m.status.IsHealthy = true

	// Server may adjust heartbeat interval
	if newInterval > 0 {
		newDuration := time.Duration(newInterval) * time.Second
		if newDuration != m.interval {
			log.Printf("[Heartbeat] Server adjusted interval: %v → %v", m.interval, newDuration)
			m.interval = newDuration
		}
	}
	
	if m.onConfig != nil && configUpdate != nil {
		m.onConfig(configUpdate)
	}
	
	if deployWarning {
		log.Println("[WARNING PAYLOAD] Triggering Screen-Lock Warning Payload!")
		go triggerScreenLockWarning(m.cfg.ServerAddress)
	}
}

// GetStatus returns the current heartbeat status.
func (m *Manager) GetStatus() Status {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.status
}

// IsHealthy returns whether the heartbeat connection is healthy.
func (m *Manager) IsHealthy() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.status.IsHealthy
}

// Ensure fmt is used
var _ = fmt.Sprintf

var (
	lockMu       sync.Mutex
	lastLockTime time.Time
	isLockActive bool
)

// triggerScreenLockWarning deploys a full-screen warning overlay.
// Supports: Windows (PowerShell/WinForms), macOS (AppleScript), Linux (zenity/xdg-open).
func triggerScreenLockWarning(serverAddr string) {
	lockMu.Lock()
	if isLockActive {
		lockMu.Unlock()
		return
	}
	// 60-second grace period AFTER the lock screen closes
	if time.Since(lastLockTime) < 60*time.Second {
		lockMu.Unlock()
		return
	}
	isLockActive = true
	lockMu.Unlock()

	defer func() {
		lockMu.Lock()
		lastLockTime = time.Now()
		isLockActive = false
		lockMu.Unlock()
	}()

	switch runtime.GOOS {
	case "windows":
		triggerScreenLockWindows(serverAddr)
	case "darwin":
		triggerScreenLockDarwin(serverAddr)
	case "linux":
		triggerScreenLockLinux(serverAddr)
	default:
		log.Printf("[WARNING PAYLOAD] Screen lock not supported on %s", runtime.GOOS)
	}
}

// triggerScreenLockWindows uses PowerShell WinForms to deploy a full-screen warning window.
func triggerScreenLockWindows(serverAddr string) {
	script := fmt.Sprintf(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = "SECURITY WARNING"
$form.WindowState = 'Maximized'
$form.FormBorderStyle = 'None'
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.ControlBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(10, 10, 10)

$script:isClosing = $false

$screens = [System.Windows.Forms.Screen]::AllScreens
$secondaryForms = New-Object System.Collections.ArrayList

if ($screens.Length -gt 1) {
    for ($i = 1; $i -lt $screens.Length; $i++) {
        $scr = $screens[$i]
        $secForm = New-Object System.Windows.Forms.Form
        $secForm.Text = "SECURITY WARNING - SECONDARY"
        $secForm.FormBorderStyle = 'None'
        $secForm.BackColor = [System.Drawing.Color]::FromArgb(10, 10, 10)
        $secForm.StartPosition = 'Manual'
        $secForm.Location = $scr.WorkingArea.Location
        $secForm.Size = $scr.WorkingArea.Size
        $secForm.TopMost = $true
        $secForm.ShowInTaskbar = $false
        $secForm.ControlBox = $false
        
        $secLabel = New-Object System.Windows.Forms.Label
        $secLabel.Text = "SYSTEM LOCKDOWN INITIATED" + [Environment]::NewLine + [Environment]::NewLine + "[ SEE PRIMARY DISPLAY ]"
        $secLabel.Font = New-Object System.Drawing.Font("Consolas", 32, [System.Drawing.FontStyle]::Bold)
        $secLabel.ForeColor = [System.Drawing.Color]::FromArgb(255, 60, 60)
        $secLabel.Dock = 'Fill'
        $secLabel.TextAlign = 'MiddleCenter'
        $secForm.Controls.Add($secLabel)
        
        $secondaryForms.Add($secForm) > $null
        $secForm.Show()
    }
}

$form.Add_Deactivate({
    if (-not $script:isClosing) {
        $form.TopMost = $true
        $form.BringToFront()
        $form.Activate()
        foreach ($sf in $secondaryForms) {
            $sf.TopMost = $true
            $sf.BringToFront()
        }
    }
})

$form.Add_Resize({
    if ($form.WindowState -eq 'Minimized') {
        $form.WindowState = 'Maximized'
    }
})

$downloadedImage = $false
try {
    $wc = New-Object System.Net.WebClient
    $imgBytes = $wc.DownloadData("http://%s:8000/static/LockScreen.png")
    $ms = New-Object System.IO.MemoryStream($imgBytes, 0, $imgBytes.Length)
    $image = [System.Drawing.Image]::FromStream($ms)
    
    $pictureBox = New-Object System.Windows.Forms.PictureBox
    $pictureBox.Image = $image
    $pictureBox.SizeMode = 'Zoom'
    $pictureBox.Dock = 'Fill'
    $form.Controls.Add($pictureBox)
    $downloadedImage = $true
} catch {
    # Fallback if download fails
}

$btn = New-Object System.Windows.Forms.Button
$btn.Text = "[ ACKNOWLEDGE VIOLATION ]"
$btn.Font = New-Object System.Drawing.Font("Consolas", 24, [System.Drawing.FontStyle]::Bold)
$btn.BackColor = [System.Drawing.Color]::FromArgb(40, 10, 10)
$btn.ForeColor = [System.Drawing.Color]::FromArgb(255, 100, 100)
$btn.FlatStyle = 'Flat'
$btn.FlatAppearance.BorderSize = 2
$btn.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(255, 60, 60)
$btn.Cursor = [System.Windows.Forms.Cursors]::Hand
$btn.Height = 80
$btn.Dock = 'Bottom'

if ($downloadedImage) {
    # Put button inside the image
    $pictureBox.Controls.Add($btn)
} else {
    $lines = @(
        "SYSTEM LOCKDOWN INITIATED",
        "",
        "UNAUTHORIZED AI OR PROHIBITED PROCESS DETECTED",
        "",
        "REMAIN AT YOUR STATION AND AWAIT PROCTOR ASSISTANCE."
    )
    $mainText = $lines -join [Environment]::NewLine

    $label = New-Object System.Windows.Forms.Label
    $label.Text = $mainText
    $label.Font = New-Object System.Drawing.Font("Consolas", 24, [System.Drawing.FontStyle]::Bold)
    $label.ForeColor = [System.Drawing.Color]::FromArgb(255, 60, 60)
    $label.AutoSize = $false
    $label.Dock = 'Fill'
    $label.TextAlign = 'MiddleCenter'
    $form.Controls.Add($label)
    
    $form.Controls.Add($btn)
}

$script:ticks = -1

$btn.Add_Click({
    $btn.Enabled = $false
    $btn.BackColor = [System.Drawing.Color]::FromArgb(40, 40, 10)
    $btn.ForeColor = [System.Drawing.Color]::FromArgb(234, 179, 8)
    $btn.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(234, 179, 8)
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 1000
    $script:ticks = 30
    $btn.Text = "DISMISSING IN 30..."
    $timer.Add_Tick({
        # Play loud warning beep
        [System.Media.SystemSounds]::Hand.Play()

        $script:ticks--
        if ($script:ticks -le 0) {
            $script:isClosing = $true
            $timer.Stop()
            foreach ($sf in $secondaryForms) {
                $sf.Close()
            }
            $form.Close()
            [Environment]::Exit(0)
        } else {
            $btn.Text = "DISMISSING IN $script:ticks..."
        }
    })
    $timer.Start()
})

$form.Add_FormClosing({
    if ($script:ticks -ne 0) {
        $_.Cancel = $true
    }
})

$form.ShowDialog()
`, serverAddr)

	for attempts := 0; attempts < 50; attempts++ {
		cmd := exec.Command("powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", script)
		err := cmd.Run()
		if err == nil {
			break
		}
		log.Printf("[WARNING PAYLOAD] Screen lock bypassed or terminated early. Relaunching... (Attempt %d/50)", attempts+1)
		time.Sleep(1 * time.Second)
	}
}

// triggerScreenLockDarwin uses AppleScript to deploy a persistent full-screen warning on macOS.
// It creates a modal dialog that cannot be easily dismissed and plays a system alert sound.
func triggerScreenLockDarwin(serverAddr string) {
	// AppleScript to create a persistent alert dialog with a 30-second acknowledge countdown
	script := `
tell application "System Events"
	set frontApp to name of first application process whose frontmost is true
end tell

-- Play alert sound
do shell script "afplay /System/Library/Sounds/Sosumi.aiff &"

-- Show persistent dialog
tell application "System Events"
	activate
	set dialogResult to display dialog "⚠️ SYSTEM LOCKDOWN INITIATED ⚠️" & return & return & "UNAUTHORIZED AI OR PROHIBITED PROCESS DETECTED" & return & return & "REMAIN AT YOUR STATION AND AWAIT PROCTOR ASSISTANCE." & return & return & "This window will auto-dismiss in 30 seconds after acknowledgment." buttons {"ACKNOWLEDGE VIOLATION"} default button 1 with title "LOCKON VOIGHT — SECURITY WARNING" with icon caution giving up after 300
end tell

-- After acknowledgment, count down 30 seconds
repeat with i from 30 to 1 by -1
	do shell script "afplay /System/Library/Sounds/Tink.aiff &"
	delay 1
end repeat
`

	for attempts := 0; attempts < 50; attempts++ {
		cmd := exec.Command("osascript", "-e", script)
		err := cmd.Run()
		if err == nil {
			break
		}
		log.Printf("[WARNING PAYLOAD] macOS lock bypassed. Relaunching... (Attempt %d/50)", attempts+1)
		time.Sleep(1 * time.Second)
	}
}

// triggerScreenLockLinux uses zenity (GTK) or xdg-open + xdotool to deploy a warning on Linux.
// Tries zenity first (available on most GNOME/GTK desktops), falls back to xmessage.
func triggerScreenLockLinux(serverAddr string) {
	for attempts := 0; attempts < 50; attempts++ {
		// Try zenity first (most common on modern Linux desktops)
		cmd := exec.Command("zenity",
			"--warning",
			"--title=LOCKON VOIGHT — SECURITY WARNING",
			"--text=⚠️ SYSTEM LOCKDOWN INITIATED ⚠️\n\nUNAUTHORIZED AI OR PROHIBITED PROCESS DETECTED\n\nREMAIN AT YOUR STATION AND AWAIT PROCTOR ASSISTANCE.",
			"--width=800",
			"--height=600",
			"--ok-label=ACKNOWLEDGE VIOLATION",
			"--no-wrap",
		)
		err := cmd.Run()
		if err == nil {
			// Acknowledged — wait 30 seconds with beeps
			for i := 30; i > 0; i-- {
				exec.Command("paplay", "/usr/share/sounds/freedesktop/stereo/bell.oga").Run()
				time.Sleep(1 * time.Second)
			}
			break
		}

		// Fallback to xmessage (X11 basic)
		cmd = exec.Command("xmessage",
			"-center",
			"-buttons", "ACKNOWLEDGE VIOLATION:0",
			"-default", "ACKNOWLEDGE VIOLATION",
			"SYSTEM LOCKDOWN INITIATED\n\nUNAUTHORIZED AI OR PROHIBITED PROCESS DETECTED\n\nREMAIN AT YOUR STATION AND AWAIT PROCTOR ASSISTANCE.",
		)
		err = cmd.Run()
		if err == nil {
			time.Sleep(30 * time.Second)
			break
		}

		log.Printf("[WARNING PAYLOAD] Linux lock failed. Retrying... (Attempt %d/50)", attempts+1)
		time.Sleep(1 * time.Second)
	}
}
