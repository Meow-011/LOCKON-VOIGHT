.PHONY: build build-windows build-linux build-watchdog clean proto all

BINARY_NAME=voight-sentinel
WATCHDOG_NAME=voight-watchdog
VERSION=0.1.0
LDFLAGS=-ldflags="-s -w -X main.AppVersion=$(VERSION)"

# Build everything for current platform
all: build build-watchdog

# ─── Primary Agent ────────────────────────────

# Build agent for current platform
build:
	go build $(LDFLAGS) -o bin/$(BINARY_NAME) ./cmd/voight

# Cross-compile agent for Windows
build-windows:
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o bin/$(BINARY_NAME).exe ./cmd/voight

# Cross-compile agent for Linux
build-linux:
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o bin/$(BINARY_NAME)-linux ./cmd/voight

# Build with obfuscation (requires garble: go install mvdan.cc/garble@latest)
build-hardened:
	garble -literals -tiny build $(LDFLAGS) -o bin/$(BINARY_NAME)-hardened ./cmd/voight

# ─── Watchdog ─────────────────────────────────

# Build watchdog for current platform
build-watchdog:
	go build $(LDFLAGS) -o bin/$(WATCHDOG_NAME) ./cmd/watchdog

# Build watchdog for Windows
build-watchdog-windows:
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o bin/$(WATCHDOG_NAME).exe ./cmd/watchdog

# ─── Cross-Platform Bundle ────────────────────

# Build both agent + watchdog for Windows
bundle-windows: 
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o bin/windows/$(BINARY_NAME).exe ./cmd/voight
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o bin/windows/$(WATCHDOG_NAME).exe ./cmd/watchdog

# Build both agent + watchdog for Linux
bundle-linux:
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o bin/linux/$(BINARY_NAME) ./cmd/voight
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o bin/linux/$(WATCHDOG_NAME) ./cmd/watchdog

# ─── Utilities ────────────────────────────────

# Clean build artifacts
clean:
	rm -rf bin/

# Generate protobuf Go stubs
proto:
	protoc --go_out=. --go-grpc_out=. \
		--proto_path=../proto \
		../proto/voight/telemetry.proto \
		../proto/voight/enrollment.proto

# Run the agent locally (development)
run:
	go run ./cmd/voight --no-tls --server localhost

# Run tests
test:
	go test -v ./...

# Vet and lint
vet:
	go vet ./...
