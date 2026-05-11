#!/bin/bash
# Generate a self-signed SSL certificate for local development
# Usage: ./generate-cert.sh [DOMAIN]

DOMAIN="${1:-localhost}"
CERT_DIR="$(cd "$(dirname "$0")" && pwd)/certs"

mkdir -p "$CERT_DIR"

echo "Generating self-signed certificate for: $DOMAIN"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.crt" \
  -subj "/CN=$DOMAIN/O=HAPI Dev/C=US" \
  -addext "subjectAltName=DNS:$DOMAIN,DNS:*.$DOMAIN,IP:127.0.0.1,IP:::1"

echo "Certificate generated:"
echo "  Cert: $CERT_DIR/server.crt"
echo "  Key:  $CERT_DIR/server.key"
echo "  Valid for: $DOMAIN, *.$DOMAIN, 127.0.0.1, ::1"
echo ""
echo "Add to trusted certificates (optional, macOS):"
echo "  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain $CERT_DIR/server.crt"
echo ""
echo "Add to trusted certificates (optional, Linux):"
echo "  sudo cp $CERT_DIR/server.crt /usr/local/share/ca-certificates/hapi-dev.crt"
echo "  sudo update-ca-certificates"
