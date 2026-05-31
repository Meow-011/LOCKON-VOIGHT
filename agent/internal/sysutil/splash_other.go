//go:build !windows

package sysutil

// ShowMessage is a no-op on non-Windows platforms.
func ShowMessage(title, text string) {
	// Not needed on Linux/macOS
}

// ShowHTASplash is a no-op on non-Windows platforms.
func ShowHTASplash(gifData []byte) func() {
	return func() {}
}
