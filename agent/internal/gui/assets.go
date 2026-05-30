package gui

import (
	_ "embed"
)

// In a real application, you would replace these with actual image files
// and use //go:embed logo.png etc. 

//go:embed dummy_logo.png
var LogoBytes []byte

//go:embed dummy_bg.png
var BackgroundBytes []byte
