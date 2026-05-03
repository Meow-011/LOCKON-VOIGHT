//go:build !windows

package privilege

import (
	"fmt"
	"os"
)

func IsAdmin() bool {
	return os.Geteuid() == 0
}

func Elevate() error {
	// On Unix, we don't automatically pop up a GUI prompt because there is no universal way.
	// We just return an error to indicate it needs to be run via sudo.
	return fmt.Errorf("must be run with sudo")
}
