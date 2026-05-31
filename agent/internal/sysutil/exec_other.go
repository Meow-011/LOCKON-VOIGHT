//go:build !windows

package sysutil

import "os/exec"

// HideConsoleWindow is a no-op on non-Windows platforms.
func HideConsoleWindow(cmd *exec.Cmd) {
	// Not needed on Linux/macOS
}
