#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# LOCKON VOIGHT — mTLS Certificate Generation Script
# Generates CA, Server, and Agent certificates for secure comms
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

CERTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/generated"
DAYS_VALID=365
CA_SUBJECT="/C=TH/ST=Bangkok/O=LOCKON/OU=VOIGHT/CN=VOIGHT-CA"
SERVER_SUBJECT="/C=TH/ST=Bangkok/O=LOCKON/OU=VOIGHT/CN=voight-server"

echo "═══════════════════════════════════════════"
echo "  LOCKON VOIGHT — Certificate Generator"
echo "═══════════════════════════════════════════"

# Create output directory
mkdir -p "$CERTS_DIR"

# ─── 1. Generate Certificate Authority (CA) ──────────────
echo ""
echo "[1/3] Generating Certificate Authority..."

openssl genrsa -out "$CERTS_DIR/ca-key.pem" 4096

openssl req -new -x509 \
    -key "$CERTS_DIR/ca-key.pem" \
    -out "$CERTS_DIR/ca-cert.pem" \
    -days $DAYS_VALID \
    -subj "$CA_SUBJECT"

echo "  ✅ CA certificate created: ca-cert.pem"

# ─── 2. Generate Server Certificate ──────────────────────
echo ""
echo "[2/3] Generating Server certificate..."

openssl genrsa -out "$CERTS_DIR/server-key.pem" 2048

openssl req -new \
    -key "$CERTS_DIR/server-key.pem" \
    -out "$CERTS_DIR/server.csr" \
    -subj "$SERVER_SUBJECT"

# Create server extension config for SAN
cat > "$CERTS_DIR/server-ext.cnf" << EOF
[v3_req]
subjectAltName = @alt_names
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = localhost
DNS.2 = voight-server
DNS.3 = *.lockon.local
IP.1 = 127.0.0.1
IP.2 = 0.0.0.0
EOF

openssl x509 -req \
    -in "$CERTS_DIR/server.csr" \
    -CA "$CERTS_DIR/ca-cert.pem" \
    -CAkey "$CERTS_DIR/ca-key.pem" \
    -CAcreateserial \
    -out "$CERTS_DIR/server-cert.pem" \
    -days $DAYS_VALID \
    -extensions v3_req \
    -extfile "$CERTS_DIR/server-ext.cnf"

echo "  ✅ Server certificate created: server-cert.pem"

# ─── 3. Generate Agent Certificate Template ──────────────
echo ""
echo "[3/3] Generating Agent certificate template..."

# This creates a template. Use gen-agent-cert.sh for per-agent certs.
echo "  ℹ️  Use gen-agent-cert.sh <agent-name> to generate per-agent certificates."

# Clean up CSR files
rm -f "$CERTS_DIR"/*.csr "$CERTS_DIR"/*.cnf "$CERTS_DIR"/*.srl

echo ""
echo "═══════════════════════════════════════════"
echo "  Certificate generation complete!"
echo "  Output directory: $CERTS_DIR"
echo "═══════════════════════════════════════════"
echo ""
echo "  Files generated:"
echo "    ca-cert.pem      — CA certificate (distribute to agents)"
echo "    ca-key.pem       — CA private key (KEEP SECRET!)"
echo "    server-cert.pem  — Server TLS certificate"
echo "    server-key.pem   — Server TLS private key"
echo ""
