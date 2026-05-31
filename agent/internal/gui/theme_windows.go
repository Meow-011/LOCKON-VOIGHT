//go:build windows
package gui

import (
	"syscall"
	"unsafe"
)

var (
	user32 = syscall.NewLazyDLL("user32.dll")
	dwmapi = syscall.NewLazyDLL("dwmapi.dll")

	procEnumWindows           = user32.NewProc("EnumWindows")
	procGetWindowThreadProcessId = user32.NewProc("GetWindowThreadProcessId")
	procDwmSetWindowAttribute = dwmapi.NewProc("DwmSetWindowAttribute")
)

// forceDarkTitleBar attempts to set the DWMWA_USE_IMMERSIVE_DARK_MODE on all windows belonging to this process.
// Note: Since Fyne doesn't expose the HWND directly, we enumerate all windows of this process.
func forceDarkTitleBar() {
	pid := syscall.Getpid()
	
	cb := syscall.NewCallback(func(hwnd syscall.Handle, lParam uintptr) uintptr {
		var windowPid uint32
		procGetWindowThreadProcessId.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&windowPid)))
		
		if windowPid == uint32(pid) {
			// DWMWA_USE_IMMERSIVE_DARK_MODE = 20 (Windows 11) or 19 (older Windows 10)
			darkMode := int32(1)
			procDwmSetWindowAttribute.Call(uintptr(hwnd), 20, uintptr(unsafe.Pointer(&darkMode)), 4)
			procDwmSetWindowAttribute.Call(uintptr(hwnd), 19, uintptr(unsafe.Pointer(&darkMode)), 4)
		}
		return 1 // Continue enumeration
	})

	procEnumWindows.Call(cb, 0)
}
