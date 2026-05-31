//go:build windows

package sysutil

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

// ShowMessage displays a native Windows message box.
func ShowMessage(title, text string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	messageBox := user32.NewProc("MessageBoxW")
	
	tPtr, _ := syscall.UTF16PtrFromString(title)
	txPtr, _ := syscall.UTF16PtrFromString(text)
	
	messageBox.Call(
		0,
		uintptr(unsafe.Pointer(txPtr)),
		uintptr(unsafe.Pointer(tPtr)),
		0x1040, 
	)
}

// ShowHTASplash extracts an animated GIF, generates a transparent splash, and returns a function to close it.
func ShowHTASplash(gifData []byte) func() {
	tempDir := os.TempDir()
	gifPath := filepath.Join(tempDir, "voight_splash.gif")
	psPath := filepath.Join(tempDir, "voight_splash.ps1")

	os.WriteFile(gifPath, gifData, 0644)

	psContent := fmt.Sprintf(`
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.BackColor = 'Magenta'
$form.TransparencyKey = 'Magenta'
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.StartPosition = 'Manual'
$form.Width = 150
$form.Height = 150

$img = [System.Drawing.Image]::FromFile('%s')
$pb = New-Object System.Windows.Forms.PictureBox
$pb.Image = $img
$pb.SizeMode = 'Zoom'
$pb.Dock = 'Fill'
$pb.BackColor = 'Transparent'
$form.Controls.Add($pb)

$screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Left = $screen.Width - $form.Width - 20
$form.Top = ($screen.Height - $form.Height) / 2

$form.ShowDialog()
`, strings.ReplaceAll(gifPath, "\\", "\\\\"))

	os.WriteFile(psPath, []byte(psContent), 0644)

	cmd := exec.Command("powershell.exe", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", psPath)
	cmd.Start()

	return func() {
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		os.Remove(psPath)
		os.Remove(gifPath)
	}
}
