import type { TLSSocket } from "node:tls";

import { catchSync } from "./catch-error";
import { ResponseException } from "./response-exception";

declare global {
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
export const MTLSAuthMiddleware = catchSync((req, _res, next) => {
	const socket = req.socket as TLSSocket;

	_assertTlsSocket(socket);
	_assertAuthorized(socket);
	const cert = _assertClientCert(socket);
	const identity = _resolveIdentity(cert);

	req.clientIdentity = identity;

	next();
});

function _assertTlsSocket(socket: TLSSocket): void {
	if (typeof socket.getPeerCertificate !== "function") {
		throw ResponseException(
			JSON.stringify({
				error: "Non-TLS connection rejected",
				reason: "mTLS authentication requires a TLS socket",
			})
		).forbidden();
	}
}

function _assertAuthorized(socket: TLSSocket): void {
	if (!socket.authorized) {
		throw ResponseException(
			JSON.stringify({
				error: "mTLS authorization failed",
				reason: socket.authorizationError,
			})
		).forbidden();
	}
}

function _assertClientCert(
	socket: TLSSocket
): import("node:tls").PeerCertificate {
	const cert = socket.getPeerCertificate();

	if (!cert || Object.keys(cert).length === 0) {
		throw ResponseException(
			JSON.stringify({
				error: "Client certificate required",
			})
		).unauthorized();
	}

	return cert;
}

function _resolveIdentity(cert: import("node:tls").PeerCertificate): string {
	const raw = cert.subjectaltname ?? cert.subject?.CN;

	if (!raw) {
		throw ResponseException(
			JSON.stringify({
				error: "Client identity could not be resolved",
				reason: "Certificate has no SAN or CN",
			})
		).unauthorized();
	}

	return Array.isArray(raw) ? raw.join(", ") : raw;
}
