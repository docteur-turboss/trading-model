import express from "express";
import helmet from "helmet";
import https from "https";
import path from "path";
import fs from "fs";

/**
 * Configuration
 * In production, certificates must come from:
 * - a Secret Manager
 * - or be mounted in volume (K8s, ECS, Nomad, etc.)
 */
const CERT_DIR = process.env.TLS_CERT_DIR ?? path.resolve(__dirname, "../certs");

function readCert(filename: string): Buffer {
  return fs.readFileSync(path.join(CERT_DIR, filename));
}

const tlsOptions: https.ServerOptions = {
  key: readCert("server.key"),
  cert: readCert("server.pem"),
  ca: readCert("ca.pem"),
  requestCert: true,
  rejectUnauthorized: true,
  minVersion: "TLSv1.2",
  honorCipherOrder: true
};

const app = express();

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use();

/**
 * ===== Routes =====
 */
app.get("/healthz", (_req, res) => {
  res.status(200).send("OK");
});

app.get("/readyz", (_req, res) => {
  res.status(200).send("READY");
});

app.get("/secure", (req, res) => {
  res.json({
    message: "Secure endpoint reached",
    client: (req as any).clientIdentity
  });
});

/**
 * ===== Error Handling =====
 */
app.use((err: Error, _req, res, _next) => {
  console.error("Unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
});

const server = https.createServer(tlsOptions, app);

server.keepAliveTimeout = 60_000;
server.headersTimeout = 65_000;

const PORT = Number(process.env.PORT ?? 8443);

server.listen(PORT, () => {
  console.log(`mTLS Express server listening on port ${PORT}`);
});
