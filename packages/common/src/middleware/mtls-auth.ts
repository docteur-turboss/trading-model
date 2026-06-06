import { TLSSocket } from 'node:tls';

import { catchSync } from './catch-error';
import { ResponseException } from './response-exception';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Logical client identity extracted from the mTLS client certificate. */
      clientIdentity: string;
    }
  }
}

/**
 * mTLS Authentication Middleware
 *
 * Enforces mutual TLS (mTLS) authentication at the transport layer.
 * Rejects non-TLS connections immediately to prevent unauthenticated access.
 * Verifies that:
 *  - The socket is a valid TLS socket
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
  /**
   * Step 0 — Validate socket is TLS
   *
   * `req.socket as TLSSocket` silently succeeds on non-TLS connections
   * (HTTP, plain TCP). Verify TLS-specific properties before proceeding
   * to ensure we fail closed when mTLS is not the transport.
   */
  const socket = req.socket as TLSSocket;

  if (typeof socket.getPeerCertificate !== 'function') {
    throw ResponseException(
      JSON.stringify({
        error: 'Non-TLS connection rejected',
        reason: 'mTLS authentication requires a TLS socket',
      })
    ).Forbidden();
  }

  /**
   * Step 1 — Verify TLS authorization
   *
   * `socket.authorized` is set by Node.js during the TLS handshake.
   * A value of `false` indicates that the client certificate failed
   * validation (unknown CA, expired cert, invalid chain, etc.).
   */
  if (!socket.authorized) {
    throw ResponseException(
      JSON.stringify({
        error: 'mTLS authorization failed',
        reason: socket.authorizationError,
      })
    ).Forbidden();
  }

  /**
   * Step 2 — Ensure a client certificate is present
   *
   * Even if the TLS handshake succeeded, the peer certificate may be empty
   * if the client did not provide one.
   */
  const cert = socket.getPeerCertificate();

  if (!cert || Object.keys(cert).length === 0) {
    throw ResponseException(
      JSON.stringify({
        error: 'Client certificate required',
      })
    ).Unauthorized();
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
  const raw = cert.subjectaltname ?? cert.subject?.CN ?? 'unknown';
  const identity = Array.isArray(raw) ? raw.join(', ') : raw;

  /**
   * Step 4 — Attach identity to request context
   *
   * The identity is injected into the request object to be consumed
   * by downstream middlewares, controllers, or authorization layers.
   */
  req.clientIdentity = identity;

  // Continue request processing
  next();
});
