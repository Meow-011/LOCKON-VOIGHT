package gui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"
	"fyne.io/fyne/v2/driver/desktop"
)

// SegmentedProgressBar is a retro-style battery/progress meter.
type SegmentedProgressBar struct {
	widget.BaseWidget
	Value        float64 // 0.0 to 1.0
	Segments     int
	blocks       []*canvas.Rectangle
	containerBox *fyne.Container
	outerBox     *canvas.Rectangle
}

func NewSegmentedProgressBar(segments int) *SegmentedProgressBar {
	s := &SegmentedProgressBar{
		Value:    1.0,
		Segments: segments,
		blocks:   make([]*canvas.Rectangle, segments),
	}
	s.ExtendBaseWidget(s)
	
	s.containerBox = container.New(layout.NewGridLayout(segments))
	yellowOutline := color.NRGBA{R: 255, G: 204, B: 0, A: 255}

	for i := 0; i < segments; i++ {
		rect := canvas.NewRectangle(color.Transparent)
		rect.StrokeColor = yellowOutline
		rect.StrokeWidth = 2
		rect.SetMinSize(fyne.NewSize(20, 30))
		s.blocks[i] = rect
		s.containerBox.Add(container.NewPadded(rect))
	}

	// Create the outer bounding box and save it to the struct
	s.outerBox = canvas.NewRectangle(color.Transparent)
	s.outerBox.StrokeWidth = 3

	s.UpdateValue(1.0)
	return s
}

func (s *SegmentedProgressBar) UpdateValue(val float64) {
	if val < 0 {
		val = 0
	}
	if val > 1.0 {
		val = 1.0
	}
	s.Value = val

	filledSegments := int(val * float64(s.Segments))
	
	// Determine color based on value (1.0 = safe, 0.0 = danger)
	var activeColor color.NRGBA
	if val >= 0.7 {
		activeColor = color.NRGBA{R: 0, G: 255, B: 0, A: 255} // Green
	} else if val >= 0.3 {
		activeColor = color.NRGBA{R: 255, G: 204, B: 0, A: 255} // Yellow
	} else {
		activeColor = color.NRGBA{R: 255, G: 0, B: 50, A: 255} // Red
	}

	for i := 0; i < s.Segments; i++ {
		s.blocks[i].StrokeColor = activeColor
		if i < filledSegments {
			s.blocks[i].FillColor = activeColor
		} else {
			s.blocks[i].FillColor = color.Transparent
		}
		s.blocks[i].Refresh()
	}
	
	if s.outerBox != nil {
		s.outerBox.StrokeColor = activeColor
		s.outerBox.Refresh()
	}
}

func (s *SegmentedProgressBar) CreateRenderer() fyne.WidgetRenderer {
	c := container.NewStack(s.outerBox, container.NewPadded(s.containerBox))
	return widget.NewSimpleRenderer(c)
}

// RetroButton is a custom button that correctly inverts colors on hover.
type RetroButton struct {
	widget.BaseWidget
	Label      string
	OnTapped   func()
	BgColor    color.Color
	TextColor  color.Color
	
	bgRect     *canvas.Rectangle
	textCanvas *canvas.Text
	isHovered  bool
	isDisabled bool
}

func NewRetroButton(label string, bgColor color.Color, textColor color.Color, tapped func()) *RetroButton {
	b := &RetroButton{
		Label:     label,
		OnTapped:  tapped,
		BgColor:   bgColor,
		TextColor: textColor,
	}
	b.ExtendBaseWidget(b)
	
	b.bgRect = canvas.NewRectangle(bgColor)
	b.bgRect.SetMinSize(fyne.NewSize(120, 40))
	
	b.textCanvas = canvas.NewText(label, textColor)
	b.textCanvas.Alignment = fyne.TextAlignCenter
	b.textCanvas.TextStyle.Bold = true
	
	return b
}

func (b *RetroButton) CreateRenderer() fyne.WidgetRenderer {
	c := container.NewStack(b.bgRect, container.NewPadded(b.textCanvas))
	return widget.NewSimpleRenderer(c)
}

func (b *RetroButton) Tapped(pe *fyne.PointEvent) {
	if b.isDisabled || b.OnTapped == nil {
		return
	}
	b.OnTapped()
}

func (b *RetroButton) MouseIn(me *desktop.MouseEvent) {
	if b.isDisabled { return }
	b.isHovered = true
	b.bgRect.FillColor = b.TextColor
	b.textCanvas.Color = b.BgColor
	b.bgRect.Refresh()
	b.textCanvas.Refresh()
}

func (b *RetroButton) MouseOut() {
	if b.isDisabled { return }
	b.isHovered = false
	b.bgRect.FillColor = b.BgColor
	b.textCanvas.Color = b.TextColor
	b.bgRect.Refresh()
	b.textCanvas.Refresh()
}

func (b *RetroButton) MouseMoved(*desktop.MouseEvent) {}

func (b *RetroButton) Disable() {
	b.isDisabled = true
	b.isHovered = false
	b.bgRect.FillColor = color.NRGBA{R: 50, G: 50, B: 50, A: 255}
	b.textCanvas.Color = color.NRGBA{R: 120, G: 120, B: 120, A: 255}
	b.bgRect.Refresh()
	b.textCanvas.Refresh()
}

func (b *RetroButton) Enable() {
	b.isDisabled = false
	b.bgRect.FillColor = b.BgColor
	b.textCanvas.Color = b.TextColor
	b.bgRect.Refresh()
	b.textCanvas.Refresh()
}
