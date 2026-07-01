// Set required env vars for all tests before module imports
process.env.TLS_KEY_PATH = process.env.TLS_KEY_PATH ?? '/etc/tls/key.pem';
process.env.TLS_CERT_PATH = process.env.TLS_CERT_PATH ?? '/etc/tls/cert.pem';
process.env.TLS_CA_PATH = process.env.TLS_CA_PATH ?? '/etc/tls/ca.pem';
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
