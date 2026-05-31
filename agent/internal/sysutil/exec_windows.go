//go:build windows

package sysutil

import (
	"os/exec"
	"syscall"
)

// HideConsoleWindow configures the Cmd to hide the console window when running on Windows.
func HideConsoleWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
}
