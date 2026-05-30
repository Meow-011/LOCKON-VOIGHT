package assets

import (
	_ "embed"
)

//go:embed Logo.png
var LogoBytes []byte

//go:embed icons-tab.svg
var IconTabBytes []byte

//go:embed PressStart2P-Regular.ttf
var FontBytes []byte
