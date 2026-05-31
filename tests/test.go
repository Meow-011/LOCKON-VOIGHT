package main
import (
	"os/exec"
	"fmt"
)
func main() {
	script := `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = "SECURITY WARNING"
$form.WindowState = 'Maximized'
$form.FormBorderStyle = 'None'
$form.TopMost = $true
$form.BackColor = 'Black'

$label = New-Object System.Windows.Forms.Label
$label.Text = "SECURITY WARNING"
$label.Font = New-Object System.Drawing.Font("Consolas", 48, [System.Drawing.FontStyle]::Bold)
$label.ForeColor = 'Red'
$label.AutoSize = $true
$label.TextAlign = 'MiddleCenter'
$label.Dock = 'Fill'

$btn = New-Object System.Windows.Forms.Button
$btn.Text = "ACKNOWLEDGE"
$btn.Font = New-Object System.Drawing.Font("Consolas", 24, [System.Drawing.FontStyle]::Bold)
$btn.BackColor = 'DarkRed'
$btn.ForeColor = 'White'
$btn.Dock = 'Bottom'
$btn.Height = 100

$btn.Add_Click({
    $btn.Enabled = $false
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 1000
    $script:ticks = 3
    $btn.Text = "DISMISSING IN 3..."
    $timer.Add_Tick({
        $script:ticks--
        if ($script:ticks -le 0) {
            $timer.Stop()
            $form.Close()
        } else {
            $btn.Text = "DISMISSING IN $script:ticks..."
        }
    })
    $timer.Start()
})

$form.Controls.Add($label)
$form.Controls.Add($btn)
$form.ShowDialog()
`
	out, err := exec.Command("powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", script).CombinedOutput()
	fmt.Printf("OUT: %s\nERR: %v\n", string(out), err)
}
