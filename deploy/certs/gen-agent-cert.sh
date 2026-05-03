#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# LOCKON VOIGHT — Per-Agent Certificate Generator
# Generates a unique mTLS client certificate for each agent
#
# Usage: ./gen-agent-cert.sh <agent-name>
# Example: ./gen-agent-cert.sh contestant-01
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <agent-name>"
    echo "Example: $0 contestant-01"
    exit 1
fi

AGENT_NAME="$1"
CERTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/generated"
AGENTS_DIR="$CERTS_DIR/agents"
DAYS_VALID=30  # Agent certs are short-lived (competition duration)
AGENT_SUBJECT="/C=TH/ST=Bangkok/O=LOCKON/OU=VOIGHT-Agent/CN=$AGENT_NAME"

# Validate CA exists
if [ ! -f "$CERTS_DIR/ca-key.pem" ] || [ ! -f "$CERTS_DIR/ca-cert.pem" ]; then
    echo "❌ CA certificate not found. Run generate-ca.sh first."
    exit 1
fi

echo "═══════════════════════════════════════════"
echo "  Generating certificate for: $AGENT_NAME"
echo "═══════════════════════════════════════════"

# Create agent certs directory
mkdir -p "$AGENTS_DIR/$AGENT_NAME"

# Generate agent key
openssl genrsa -out "$AGENTS_DIR/$AGENT_NAME/agent-key.pem" 2048

# Generate CSR
openssl req -new \
    -key "$AGENTS_DIR/$AGENT_NAME/agent-key.pem" \
    -out "$AGENTS_DIR/$AGENT_NAME/agent.csr" \
    -subj "$AGENT_SUBJECT"

# Create agent extension config
cat > "$AGENTS_DIR/$AGENT_NAME/agent-ext.cnf" << EOF
[v3_req]
extendedKeyUsage = clientAuth
EOF

# Sign with CA
openssl x509 -req \
    -in "$AGENTS_DIR/$AGENT_NAME/agent.csr" \
    -CA "$CERTS_DIR/ca-cert.pem" \
    -CAkey "$CERTS_DIR/ca-key.pem" \
    -CAcreateserial \
    -out "$AGENTS_DIR/$AGENT_NAME/agent-cert.pem" \
    -days $DAYS_VALID \
    -extensions v3_req \
    -extfile "$AGENTS_DIR/$AGENT_NAME/agent-ext.cnf"

# Copy CA cert for convenience
cp "$CERTS_DIR/ca-cert.pem" "$AGENTS_DIR/$AGENT_NAME/ca-cert.pem"

# Clean up
rm -f "$AGENTS_DIR/$AGENT_NAME"/*.csr "$AGENTS_DIR/$AGENT_NAME"/*.cnf

echo ""
echo "✅ Agent certificate generated!"
echo ""
echo "  Directory: $AGENTS_DIR/$AGENT_NAME/"
echo "  Files:"
echo "    agent-cert.pem  — Agent client certificate"
echo "    agent-key.pem   — Agent private key"
echo "    ca-cert.pem     — CA certificate (for server verification)"
echo ""
echo "  Validity: $DAYS_VALID days"
echo ""
echo "  Bundle these files with the agent binary for deployment."
echo ""
