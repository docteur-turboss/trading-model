// Runs after jest.setup.ts: point the service at the Testcontainers MongoDB.
process.env.MONGO_URI = process.env.TEST_MONGO_URI;
process.env.MONGO_DB = "dlq_db_spec";
process.env.MONGO_COLLECTION = "dlq_entries";
process.env.MAX_ENTRIES = "10000";
// The env schema rejects the blanks jest.setup.ts leaves for mocked unit specs.
process.env.PORT = "3000";
process.env.TLS_KEY_PATH = "/unused/tls.key";
process.env.TLS_CERT_PATH = "/unused/tls.crt";
process.env.TLS_CA_PATH = "/unused/ca.crt";
