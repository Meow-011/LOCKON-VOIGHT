package gui

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/driver/desktop"

	"github.com/lockon/voight-agent/internal/config"
	"github.com/lockon/voight-agent/internal/grpcclient"
	"github.com/lockon/voight-agent/internal/gui/assets"
)

type AppGUI struct {
	fyneApp     fyne.App
	mainWindow  fyne.Window
	cfg         *config.Config
	grpcClient  *grpcclient.Client
	cancelCore  context.CancelFunc

	titleText   *canvas.Text
	scoreText   *canvas.Text
	timeText    *canvas.Text
	progBar     *SegmentedProgressBar
	
	helpBtn     *RetroButton
	discBtn     *RetroButton
	
	footerText  *canvas.Text
	footerBg    *canvas.Rectangle
	
	trayStatus  *fyne.MenuItem
	trayMenu    *fyne.Menu
	
	lastHelpReq time.Time
	
	warningMu   sync.Mutex
	warningOn   bool
}

func NewAppGUI(cfg *config.Config, grpcClient *grpcclient.Client, cancelCore context.CancelFunc) *AppGUI {
	a := app.NewWithID("com.lockon.voight")
	a.Settings().SetTheme(&customTheme{})
	a.SetIcon(fyne.NewStaticResource("icon.svg", assets.IconTabBytes))
	w := a.NewWindow("LOCKON VOIGHT Sentinel")
	
	w.Resize(fyne.NewSize(930, 330))
	w.SetFixedSize(true)
	
	gui := &AppGUI{
		fyneApp:    a,
		mainWindow: w,
		cfg:        cfg,
		grpcClient: grpcClient,
		cancelCore: cancelCore,
	}

	gui.setupUI()
	gui.setupTray()

	w.SetCloseIntercept(func() {
		w.Hide()
	})
	
	// Start clock updater
	go func() {
		for {
			time.Sleep(1 * time.Second)
			if gui.timeText != nil {
				now := time.Now().Format("15:04:05")
				fyne.Do(func() {
					gui.timeText.Text = fmt.Sprintf("ETF 18:00  %s LOCAL", now)
					gui.timeText.Refresh()
				})
			}
		}
	}()

	return gui
}

func (g *AppGUI) setupUI() {
	// Logo (Left)
	logoImg := canvas.NewImageFromResource(fyne.NewStaticResource("logo.png", assets.LogoBytes))
	logoImg.FillMode = canvas.ImageFillContain
	logoImg.SetMinSize(fyne.NewSize(280, 280))

	// Texts (Right)
	g.titleText = canvas.NewText("VOIGHT-KAMPFF PROTOCOL", color.White)
	g.titleText.TextSize = 20

	g.timeText = canvas.NewText("ETF 18:00  00:00:00 LOCAL", color.White)
	g.timeText.TextSize = 14
	
	g.scoreText = canvas.NewText("WEIGHT SCORE: SECURE", color.White)
	g.scoreText.TextSize = 14

	textVBox := container.NewVBox(
		g.titleText,
		g.timeText,
		g.scoreText,
	)

	// Progress Bar
	g.progBar = NewSegmentedProgressBar(16)
	g.progBar.UpdateValue(1.0)
	progContainer := container.NewPadded(g.progBar)

	// Buttons
	cyanColor := color.NRGBA{R: 0, G: 255, B: 255, A: 255}
	redColor := color.NRGBA{R: 255, G: 0, B: 50, A: 255}
	
	g.helpBtn = NewRetroButton("REQUEST HELP", cyanColor, color.Black, g.onHelpRequest)
	g.discBtn = NewRetroButton("DISCONNECT", redColor, color.White, g.onDisconnect)
	
	btnLayout := container.NewHBox(
		layout.NewSpacer(), 
		g.helpBtn, 
		container.NewGridWrap(fyne.NewSize(15, 1), layout.NewSpacer()), // 15px gap
		g.discBtn,
	)

	// Right side layout (compact, no expansive spacers)
	rightSideContent := container.NewVBox(
		textVBox,
		container.NewGridWrap(fyne.NewSize(1, 10), layout.NewSpacer()), // Small gap
		progContainer,
		container.NewGridWrap(fyne.NewSize(1, 5), layout.NewSpacer()), // Small gap
		btnLayout,
	)

	// Vertically center the right side relative to the logo
	rightSideCentered := container.NewVBox(
		layout.NewSpacer(),
		rightSideContent,
		layout.NewSpacer(),
	)

	// Main Layout (Logo + Gap + RightSide)
	mainLayout := container.NewHBox(
		logoImg,
		container.NewGridWrap(fyne.NewSize(30, 1), layout.NewSpacer()), // 30px gap between logo and text
		rightSideCentered,
	)
	
	// Add explicit outer margins
	paddedLayout := container.NewHBox(
		container.NewGridWrap(fyne.NewSize(40, 1), layout.NewSpacer()), // Left margin 40px
		mainLayout,
		container.NewGridWrap(fyne.NewSize(40, 1), layout.NewSpacer()), // Right margin 40px
	)
	
	// Center everything so resizing the window doesn't break the layout
	centeredContent := container.NewCenter(paddedLayout)
	
	// Footer Bar
	g.footerText = canvas.NewText("DISTINGUISH SYNTHETIC REPLICANTS", color.White)
	g.footerText.TextSize = 16
	
	purpleColor := color.NRGBA{R: 160, G: 32, B: 240, A: 255} // Retro purple
	g.footerBg = canvas.NewRectangle(purpleColor)
	g.footerBg.SetMinSize(fyne.NewSize(100, 40)) // Give it a fixed height of 40px
	
	footerContent := container.NewHBox(
		container.NewGridWrap(fyne.NewSize(40, 1), layout.NewSpacer()), // Left padding 40px
		container.NewCenter(g.footerText),
	)
	
	footerBar := container.NewStack(g.footerBg, footerContent)
	
	// Final Layout with Border
	finalLayout := container.NewBorder(nil, footerBar, nil, nil, centeredContent)
	
	stack := container.NewStack(finalLayout)
	g.mainWindow.SetContent(stack)
}

func (g *AppGUI) setupTray() {
	if desk, ok := g.fyneApp.(desktop.App); ok {
		g.trayStatus = fyne.NewMenuItem("Status: SECURE (Score 0)", nil)
		g.trayStatus.Disabled = true // Just for display
		
		g.trayMenu = fyne.NewMenu("VOIGHT Sentinel",
			g.trayStatus,
			fyne.NewMenuItemSeparator(),
			fyne.NewMenuItem("Show Dashboard", func() {
				g.mainWindow.Show()
			}),
		)
		desk.SetSystemTrayMenu(g.trayMenu)
		desk.SetSystemTrayIcon(fyne.NewStaticResource("tray.png", assets.IconTabBytes))
	}
}

func (g *AppGUI) SetSplashCloser(closeFunc func()) {
	var once sync.Once
	g.fyneApp.Lifecycle().SetOnEnteredForeground(func() {
		once.Do(func() {
			if closeFunc != nil {
				closeFunc()
			}
		})
	})
}

func (g *AppGUI) UpdateStatus(connected bool) {
	fyne.Do(func() {
		if connected {
			g.titleText.Text = "LOCKON VOIGHT: ACTIVE"
			g.titleText.Color = color.NRGBA{R: 0, G: 255, B: 255, A: 255}
		} else {
			g.titleText.Text = "NOT ENROLLED / OFFLINE"
			g.titleText.Color = color.NRGBA{R: 255, G: 0, B: 50, A: 255}
		}
		g.titleText.Refresh()
	})
}

func (g *AppGUI) UpdateScore(aiScore int) {
	fyne.Do(func() {
		if aiScore <= 0 {
			g.scoreText.Text = "WEIGHT SCORE: SECURE"
			g.scoreText.Color = color.NRGBA{R:0, G:255, B:0, A:255} // Green for secure
			if g.trayStatus != nil {
				g.trayStatus.Label = "Status: SECURE (Score 0)"
			}
		} else {
			g.scoreText.Text = fmt.Sprintf("WEIGHT SCORE: %d", aiScore)
			g.scoreText.Color = color.NRGBA{R:255, G:50, B:50, A:255} // Red for AI usage
			if g.trayStatus != nil {
				g.trayStatus.Label = fmt.Sprintf("Status: WARNING (Score %d)", aiScore)
			}
		}
		g.scoreText.Refresh()
		
		// Also update progress bar!
		// If score is 0 to 100, safety is (100 - aiScore) / 100.0
		safety := float64(100 - aiScore) / 100.0
		if safety < 0 { safety = 0 }
		g.progBar.UpdateValue(safety)
		
		if g.trayMenu != nil {
			g.trayMenu.Refresh()
			if desk, ok := g.fyneApp.(desktop.App); ok {
				desk.SetSystemTrayMenu(g.trayMenu)
			}
		}
	})
}

func (g *AppGUI) StartWarningCountdown(seconds int) {
	g.warningMu.Lock()
	if g.warningOn {
		g.warningMu.Unlock()
		return
	}
	g.warningOn = true
	g.warningMu.Unlock()

	go func() {
		defer func() {
			g.warningMu.Lock()
			g.warningOn = false
			g.warningMu.Unlock()
			
			// Reset
			g.footerText.Text = "DISTINGUISH SYNTHETIC REPLICANTS"
			g.footerText.Color = color.White
			g.footerBg.FillColor = color.NRGBA{R:160, G:32, B:240, A:255} // Retro purple
			g.footerText.Refresh()
			g.footerBg.Refresh()
		}()

		for i := seconds; i >= 0; i-- {
			if i%2 == 0 {
				g.footerBg.FillColor = color.NRGBA{R:255, G:0, B:50, A:255} // Bright Red
			} else {
				g.footerBg.FillColor = color.NRGBA{R:150, G:0, B:30, A:255} // Darker Red for flashing
			}
			g.footerText.Text = fmt.Sprintf("UNAUTHORIZED AI DETECTED - %d SECONDS TO COMPLY", i)
			g.footerText.Color = color.White
			g.footerText.Refresh()
			g.footerBg.Refresh()
			
			time.Sleep(1 * time.Second)
		}
	}()
}

func (g *AppGUI) onHelpRequest() {
	if time.Since(g.lastHelpReq) < 60*time.Second {
		dialog.ShowInformation("Cooldown", "You recently requested help. Please wait 60 seconds.", g.mainWindow)
		return
	}

	g.helpBtn.Disable()
	
	go func() {
		if g.cfg.ContestantID == "" {
			fyne.Do(func() {
				g.helpBtn.Enable()
				dialog.ShowError(fmt.Errorf("Cannot request help: Agent is not enrolled yet."), g.mainWindow)
			})
			return
		}
		
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		
		err := g.grpcClient.SendHelpRequest(ctx, g.cfg.ContestantID)
		
		fyne.Do(func() {
			g.helpBtn.Enable()
			if err != nil {
				dialog.ShowError(fmt.Errorf("Failed to send request: %v", err), g.mainWindow)
				return
			}
			g.lastHelpReq = time.Now()
			dialog.ShowInformation("Success", "Proctor has been notified.", g.mainWindow)
		})
	}()
}

func (g *AppGUI) onDisconnect() {
	dialog.ShowConfirm(
		"Confirm Disconnect", 
		"Are you sure? Stopping the monitor may lead to disqualification.\nThe Proctor will be notified immediately.", 
		func(confirm bool) {
			if !confirm {
				return
			}
			g.executeDisconnect()
		}, 
		g.mainWindow,
	)
}

func (g *AppGUI) executeDisconnect() {
	g.discBtn.Disable()
	g.titleText.Text = "DISCONNECTING..."
	g.titleText.Color = color.NRGBA{R:255, G:165, B:0, A:255} // Orange
	g.titleText.Refresh()

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		
		if err := g.grpcClient.SendDisconnect(ctx, g.cfg.ContestantID); err != nil {
			log.Printf("Failed to send disconnect to server: %v", err)
		}
		
		g.cancelCore()
		g.fyneApp.Quit()
	}()
}

func (g *AppGUI) Run() {
	go func() {
		// Wait for window to actually appear and get an HWND before forcing dark mode
		time.Sleep(500 * time.Millisecond)
		fyne.Do(func() {
			forceDarkTitleBar()
		})
	}()
	g.mainWindow.ShowAndRun()
}
