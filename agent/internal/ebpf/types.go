// Package ebpf provides kernel-level monitoring capabilities for the VOIGHT Agent on Linux.
//
// types.go defines shared event structures used by both the BPF programs (kernel space)
// and the Go userspace loader. These types must match the C struct definitions in bpf_program.c.
package ebpf

import "time"

// ExecEvent is emitted by the BPF program when a new process is executed (execve syscall).
type ExecEvent struct {
	PID      uint32
	Comm     [16]byte  // Process command name (from task_struct->comm)
	Filename [256]byte // Binary path (from execve argument)
}

// ConnectEvent is emitted by the BPF program when an outbound TCP connection is made.
type ConnectEvent struct {
	PID   uint32
	Comm  [16]byte
	DAddr uint32 // Destination IPv4 address in network byte order
	DPort uint16 // Destination port in host byte order
}

// OpenEvent is emitted by the BPF program when a file is opened (openat syscall).
type OpenEvent struct {
	PID      uint32
	Comm     [16]byte
	Filename [256]byte // File path being opened
}

// --- Callback types ---

// ExecCallback is called when a process execution event is received from eBPF.
type ExecCallback func(pid int32, comm, filename string, ts time.Time)

// ConnectCallback is called when a network connection event is received from eBPF.
type ConnectCallback func(pid int32, comm string, dstIP string, dstPort uint16, ts time.Time)

// OpenCallback is called when a file open event is received from eBPF.
type OpenCallback func(pid int32, comm, filename string, ts time.Time)
