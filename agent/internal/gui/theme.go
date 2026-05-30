package gui

import (
	"image/color"
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"
	"github.com/lockon/voight-agent/internal/gui/assets"
)

type customTheme struct{}

var _ fyne.Theme = (*customTheme)(nil)

func (m customTheme) Color(name fyne.ThemeColorName, variant fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNameBackground:
		return color.NRGBA{R: 20, G: 20, B: 20, A: 255} // Very dark gray/black
	case theme.ColorNameButton:
		return color.NRGBA{R: 40, G: 40, B: 40, A: 255}
	case theme.ColorNameDisabledButton:
		return color.NRGBA{R: 35, G: 35, B: 35, A: 255} // Brighter gray for disabled buttons
	case theme.ColorNameForeground:
		return color.NRGBA{R: 240, G: 240, B: 240, A: 255}
	case theme.ColorNameDisabled:
		return color.NRGBA{R: 120, G: 120, B: 120, A: 255} // Brighter text for disabled buttons
	case theme.ColorNamePlaceHolder:
		return color.NRGBA{R: 150, G: 150, B: 150, A: 255}
	case theme.ColorNamePrimary:
		return color.NRGBA{R: 0, G: 255, B: 255, A: 255} // Pure Cyan
	case fyne.ThemeColorName("foregroundOnPrimary"):
		return color.NRGBA{R: 0, G: 0, B: 0, A: 255} // Black text on Cyan
	case theme.ColorNameError:
		return color.NRGBA{R: 255, G: 0, B: 50, A: 255} // Pure Red
	case theme.ColorNameHover:
		return color.NRGBA{R: 255, G: 255, B: 255, A: 50} // High-contrast white overlay for retro button hover
	}
	return theme.DefaultTheme().Color(name, theme.VariantDark)
}

func (m customTheme) Icon(name fyne.ThemeIconName) fyne.Resource {
	return theme.DefaultTheme().Icon(name)
}

func (m customTheme) Font(style fyne.TextStyle) fyne.Resource {
	return fyne.NewStaticResource("PressStart2P.ttf", assets.FontBytes)
}

func (m customTheme) Size(name fyne.ThemeSizeName) float32 {
	return theme.DefaultTheme().Size(name)
}
