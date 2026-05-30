//go:build ignore

// generate.go provides the bpf2go build directive for compiling BPF C programs
// into Go-embeddable bytecode.
//
// To generate the BPF objects, run on a Linux machine with clang installed:
//
//   cd agent/internal/ebpf
//   go generate
//
// This requires:
//   - clang (for BPF compilation)
//   - linux-headers (for vmlinux.h and BPF helpers)
//   - github.com/cilium/ebpf/cmd/bpf2go (installed via go install)
//
// Generate vmlinux.h first (one-time setup):
//   bpftool btf dump file /sys/kernel/btf/vmlinux format c > vmlinux.h

package ebpf

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -target amd64 -type exec_event -type connect_event -type open_event bpf bpf_program.c
