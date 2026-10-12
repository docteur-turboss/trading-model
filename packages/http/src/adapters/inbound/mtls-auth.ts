import { catchSync } from "./catch-error";
import { resolveMtlsIdentity } from "./mtls-identity";
import { ResponseException } from "./response-exception";

declare global {
	namespace Express {
		interface Request {
			/** Logical client identity extracted from the mTLS client certificate. */
			clientIdentity: import("@trading-model/common/domain/primitives/auth-ids").ClientIdentity;
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
	const result = resolveMtlsIdentity(req);

	if (!result) {
		const socket = req.socket as import("node:tls").TLSSocket;
		if (typeof socket?.getPeerCertificate !== "function") {
			throw ResponseException(
				JSON.stringify({
					error: "Non-TLS connection rejected",
					reason: "mTLS authentication requires a TLS socket",
				})
			).forbidden();
		}
		if (!socket.authorized) {
			throw ResponseException(
				JSON.stringify({
					error: "mTLS authorization failed",
					reason: socket.authorizationError,
				})
			).forbidden();
		}
		const cert = socket.getPeerCertificate();
		if (!cert || Object.keys(cert).length === 0) {
			throw ResponseException(
				JSON.stringify({
					error: "Client certificate required",
				})
			).unauthorized();
		}
		throw ResponseException(
			JSON.stringify({
				error: "Client identity could not be resolved",
				reason: "Certificate has no SAN or CN",
			})
		).unauthorized();
	}

	req.clientIdentity = result.identity;
	next();
});
