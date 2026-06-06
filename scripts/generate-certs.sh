#!/bin/bash
# =============================================================================
#  generate-certs.sh — Generate self-signed TLS certificates for local dev
#  Usage:  bash scripts/generate-certs.sh
#  Output: ./certs/  (ca.crt, server.crt, server-key.pem)
# =============================================================================
set -euo pipefail

CERTS_DIR="${1:-./certs}"
mkdir -p "$CERTS_DIR"

# CA key + cert
openssl req -x509 -nodes -days 3650 -newkey rsa:4096 \
  -keyout "$CERTS_DIR/ca-key.pem" \
  -out "$CERTS_DIR/ca.crt" \
  -subj "/CN=TradingModelCA"

# Server key
openssl genrsa -out "$CERTS_DIR/server-key.pem" 4096

# Server CSR
openssl req -new -key "$CERTS_DIR/server-key.pem" \
  -out "$CERTS_DIR/server.csr" \
  -subj "/CN=trading-discovery-1" \
  -addext "subjectAltName=DNS:localhost,DNS:trading-discovery-1,DNS:discovery-server,DNS:message-manager,DNS:financial-scraper,DNS:trader-trainer,IP:127.0.0.1"

# Server cert signed by CA
openssl x509 -req -days 3650 \
  -in "$CERTS_DIR/server.csr" \
  -CA "$CERTS_DIR/ca.crt" \
  -CAkey "$CERTS_DIR/ca-key.pem" \
  -CAcreateserial \
  -out "$CERTS_DIR/server.crt" \
  -extfile <(printf "subjectAltName=DNS:localhost,DNS:trading-discovery-1,DNS:discovery-server,DNS:message-manager,DNS:financial-scraper,DNS:trader-trainer,IP:127.0.0.1")

rm -f "$CERTS_DIR/server.csr" "$CERTS_DIR/ca-key.pem" "$CERTS_DIR/ca.srl"

chmod 600 "$CERTS_DIR/server-key.pem"
echo "[OK] Certificates generated in $CERTS_DIR/"
ls -la "$CERTS_DIR/"
