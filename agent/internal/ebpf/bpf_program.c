//go:build ignore
// +build ignore

// LOCKON VOIGHT — eBPF Kernel Programs
// Compiled via bpf2go into Go-embeddable bytecode.
//
// These BPF programs attach to kernel tracepoints to provide tamper-proof,
// event-driven monitoring of process execution, network connections, and file access.
//
// Target: Linux kernel >= 5.15 (BPF CO-RE)
// Compiler: clang -target bpf (via cilium/ebpf bpf2go)

#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>

// ─── Shared Constants ────────────────────────────
#define TASK_COMM_LEN 16
#define MAX_FILENAME  256

// ─── Event Structures (must match Go types in types.go) ─────

struct exec_event {
    __u32 pid;
    char  comm[TASK_COMM_LEN];
    char  filename[MAX_FILENAME];
};

struct connect_event {
    __u32 pid;
    char  comm[TASK_COMM_LEN];
    __u32 daddr;  // Destination IPv4 in network byte order
    __u16 dport;  // Destination port in host byte order
};

struct open_event {
    __u32 pid;
    char  comm[TASK_COMM_LEN];
    char  filename[MAX_FILENAME];
};

// ─── Perf Event Ring Buffers ────────────────────

struct {
    __uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
    __uint(key_size, sizeof(__u32));
    __uint(value_size, sizeof(__u32));
} exec_events SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
    __uint(key_size, sizeof(__u32));
    __uint(value_size, sizeof(__u32));
} connect_events SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
    __uint(key_size, sizeof(__u32));
    __uint(value_size, sizeof(__u32));
} open_events SEC(".maps");

// ─── Tracepoint: sys_enter_execve ───────────────
// Fires every time a new process is executed.
// Captures the binary path and process name.

SEC("tracepoint/syscalls/sys_enter_execve")
int trace_execve(struct trace_event_raw_sys_enter *ctx) {
    struct exec_event event = {};

    event.pid = bpf_get_current_pid_tgid() >> 32;
    bpf_get_current_comm(&event.comm, sizeof(event.comm));

    // Read the filename argument (first arg to execve)
    const char *filename_ptr = (const char *)ctx->args[0];
    bpf_probe_read_user_str(&event.filename, sizeof(event.filename), filename_ptr);

    bpf_perf_event_output(ctx, &exec_events, BPF_F_CURRENT_CPU, &event, sizeof(event));
    return 0;
}

// ─── Tracepoint: sys_enter_connect ──────────────
// Fires when a process initiates a TCP/UDP connection.
// Captures the destination IP and port.

SEC("tracepoint/syscalls/sys_enter_connect")
int trace_connect(struct trace_event_raw_sys_enter *ctx) {
    struct connect_event event = {};

    event.pid = bpf_get_current_pid_tgid() >> 32;
    bpf_get_current_comm(&event.comm, sizeof(event.comm));

    // Read the sockaddr from the second argument
    struct sockaddr_in *addr = (struct sockaddr_in *)ctx->args[1];
    __u16 family = 0;
    bpf_probe_read_user(&family, sizeof(family), &addr->sin_family);

    // Only capture IPv4 connections (AF_INET = 2)
    if (family != 2) {
        return 0;
    }

    bpf_probe_read_user(&event.daddr, sizeof(event.daddr), &addr->sin_addr.s_addr);
    bpf_probe_read_user(&event.dport, sizeof(event.dport), &addr->sin_port);

    // Convert port from network byte order to host byte order
    event.dport = __builtin_bswap16(event.dport);

    bpf_perf_event_output(ctx, &connect_events, BPF_F_CURRENT_CPU, &event, sizeof(event));
    return 0;
}

// ─── Tracepoint: sys_enter_openat ───────────────
// Fires when a file is opened. We capture the filename
// and let userspace filter for model file extensions.

SEC("tracepoint/syscalls/sys_enter_openat")
int trace_openat(struct trace_event_raw_sys_enter *ctx) {
    struct open_event event = {};

    event.pid = bpf_get_current_pid_tgid() >> 32;
    bpf_get_current_comm(&event.comm, sizeof(event.comm));

    // Read the filename argument (second arg to openat: dirfd, pathname, flags, mode)
    const char *filename_ptr = (const char *)ctx->args[1];
    bpf_probe_read_user_str(&event.filename, sizeof(event.filename), filename_ptr);

    // Quick kernel-side filter: only emit events for files with model-like extensions.
    // Check the last few bytes of the filename for ".gg" (covers .gguf, .ggml)
    // or ".sa" (covers .safetensors) or ".on" (covers .onnx).
    // Full classification happens in userspace.
    // NOTE: This is a coarse filter to reduce perf buffer pressure.
    // We check if filename contains common model substrings.
    // For simplicity in BPF (limited string ops), we emit all and filter in Go.

    bpf_perf_event_output(ctx, &open_events, BPF_F_CURRENT_CPU, &event, sizeof(event));
    return 0;
}

char LICENSE[] SEC("license") = "GPL";
