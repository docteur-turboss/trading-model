import { LeaseManagerInstance } from "../core/LeaseManager";
import { logger } from "cash-lib/config/logger";
import { readCert } from "../utils/readCert";
import { app } from "./app";
import https from "https";
import path from "path";

/**
 * -------------------------
 * TLS / mTLS Configuration
 * -------------------------
 *
 * All certificate-related paths are configurable through environment variables.
 * This allows:
 * - different certificates per environment (dev / staging / prod)
 * - integration with secret managers or mounted volumes
 *
 * No certificate should be hard-coded or committed to the repository.
 */
const CERT_DIR = process.env.TLS_CERT_DIR ?? path.resolve(__dirname, "../../keys");
const KEY_FILE = process.env.TLS_KEY_FILE ?? "server-key.pem";
const CERT_FILE = process.env.TLS_CERT_FILE ?? "server.crt";
const CA_FILE = process.env.TLS_CA_FILE ?? "ca.crt";

/**
 * Listening port.
 * Defaults to 8443 to clearly indicate TLS usage.
 * Should usually be overridden by orchestration (Docker / Kubernetes).
 */
const PORT = Number(process.env.PORT ?? 8443);

/**
 * -------------------------
 * HTTPS Server Options
 * -------------------------
 *
 * Mutual TLS (mTLS) is enforced:
 * - the server presents its certificate
 * - the client MUST present a certificate signed by the trusted CA
 *
 * This guarantees:
 * - strong service-to-service authentication
 * - encrypted transport
 * - zero trust communication inside the cluster
 */
const tlsOptions: https.ServerOptions = {
  /**
   * Server private key.
   * Used to prove the server identity during TLS handshake.
   */
  key: readCert(CERT_DIR, KEY_FILE),

  /**
   * Server certificate.
   * Public certificate associated with the private key.
   */
  cert: readCert(CERT_DIR, CERT_FILE),

  /**
   * Certificate Authority (CA) used to validate client certificates.
   * Only clients signed by this CA will be allowed to connect.
   */
  ca: readCert(CERT_DIR, CA_FILE),

  /**
   * Forces clients to present a certificate.
   * Required for mutual TLS.
   */
  requestCert: true,

  /**
   * Rejects connections from clients that fail certificate validation.
   * This must ALWAYS be true in production.
   */
  rejectUnauthorized: true,

  /**
   * Enforces a minimum TLS version.
   * TLS 1.2 is the minimal acceptable version for production systems.
   */
  minVersion: "TLSv1.2",

  /**
   * Enforces server-side cipher suite ordering.
   * Prevents clients from downgrading to weaker ciphers.
   */
  honorCipherOrder: true,
};

/**
 * -------------------------
 * HTTPS Server Initialization
 * -------------------------
 *
 * The Express app is mounted on an HTTPS server
 * to ensure all incoming traffic is encrypted and authenticated.
 */
const server = https.createServer(tlsOptions, app);

/**
 * -------------------------
 * Connection Timeouts
 * -------------------------
 *
 * keepAliveTimeout:
 * Maximum time a socket is kept open between requests.
 *
 * headersTimeout:
 * Maximum time allowed to receive the full HTTP headers.
 *
 * These values help protect against:
 * - slowloris attacks
 * - resource exhaustion
 */
server.keepAliveTimeout = 60_000;
server.headersTimeout = 65_000;

/**
 * -------------------------
 * Lease Manager Startup
 * -------------------------
 * 
 * Starts the background process that cleans up expired service instances.
 * This ensures the registry remains accurate and up-to-date.
 */
LeaseManagerInstance.start();

/**
 * -------------------------
 * Server Startup
 * -------------------------
 *
 * Starts listening for incoming mTLS connections.
 * At this stage:
 * - TLS handshake is enforced
 * - client certificate validation is mandatory
 * - Express routes become accessible
 */
server.listen(PORT, () => {
  logger.info(`mTLS Express server listening on port ${PORT}`);
});