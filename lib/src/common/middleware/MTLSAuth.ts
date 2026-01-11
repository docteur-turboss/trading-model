import { TLSSocket } from "node:tls";
import { catchSync } from "./catchError";
import { ResponseException } from "./responseException";

/**
 * mTLS Authentication Middleware
 *
 * This middleware enforces mutual TLS (mTLS) authentication at the transport layer.
 * It ensures that:
 *  - The TLS handshake was successfully authorized
 *  - A valid client certificate was presented
 *  - A stable client identity can be extracted from the certificate
 *
 * The extracted identity is attached to the request object and can be used
 * downstream for authorization, auditing, or service-level authentication.
 *
 * Expected usage:
 *   - Mounted early in the middleware chain
 *   - Used on internal / service-to-service endpoints
 */
export const MTLSAuthMiddleware = catchSync((req, res, next) => {
  // Express request socket is expected to be a TLS socket when mTLS is enabled
  const socket = req.socket as TLSSocket;

  /**
   * Step 1 — Verify TLS authorization
   *
   * `socket.authorized` is set by Node.js during the TLS handshake.
   * A value of `false` indicates that the client certificate failed
   * validation (unknown CA, expired cert, invalid chain, etc.).
   */
  if (!socket.authorized) {
    throw ResponseException(JSON.stringify({
      error: "mTLS authorization failed",
      reason: socket.authorizationError
    })).Forbidden();
  }

  /**
   * Step 2 — Ensure a client certificate is present
   *
   * Even if the TLS handshake succeeded, the peer certificate may be empty
   * if the client did not provide one.
   */
  const cert = socket.getPeerCertificate();

  if (!cert || Object.keys(cert).length === 0) {
    throw ResponseException(JSON.stringify({
      error: "Client certificate required"
    })).Unauthorized();
  }

  /**
   * Step 3 — Extract client identity from certificate
   *
   * Identity resolution convention:
   *  - Prefer Subject Alternative Name (SAN), if present (URI / DNS)
   *  - Fallback to Common Name (CN)
   *  - Default to "unknown" if neither is available
   *
   * This identity is considered a *logical client identifier* and
   * should map to a service, workload, or machine identity.
   */
  const identity =
    cert.subjectaltname ??
    cert.subject?.CN ??
    "unknown";

  /**
   * Step 4 — Attach identity to request context
   *
   * The identity is injected into the request object to be consumed
   * by downstream middlewares, controllers, or authorization layers.
   */
  (req as unknown as (Request & { clientIdentity: string })).clientIdentity = identity;

  // Continue request processing
  next();
});