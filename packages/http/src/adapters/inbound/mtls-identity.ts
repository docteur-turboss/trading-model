import type { IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import {
	extractCanonicalServiceName,
	isSpiffeId,
	serviceNameFromSpiffeId,
} from "@trading-model/common/utils/spiffe";
import type { ServiceId } from "@trading-model/primitives/primitives";
import type { ClientIdentity } from "@trading-model/primitives/primitives/auth-ids";

/** Caller identity read from the verified client certificate of a request. */
export interface MtlsIdentityResult {
	/** The raw client identity from the certificate SAN/CN. */
	identity: ClientIdentity;
	/** Resolved canonical service name from the SPIFFE ID. */
	serviceName: ServiceId;
}

/**
 * Extract the mTLS client identity from an IncomingMessage.
 * Works for both Express requests and WebSocket upgrade requests.
 *
 * Returns `null` when the socket is not TLS, not authorized, or has no client
 * certificate — callers should reject the connection in those cases.
 */
export function resolveMtlsIdentity(
	req: IncomingMessage
): MtlsIdentityResult | null {
	const socket = req.socket as TLSSocket;

	if (typeof socket?.getPeerCertificate !== "function") {
		return null;
	}
	if (!socket.authorized) {
		return null;
	}

	const cert = socket.getPeerCertificate();
	if (!cert || Object.keys(cert).length === 0) {
		return null;
	}

	const raw = cert.subjectaltname ?? cert.subject?.CN;
	if (!raw) {
		return null;
	}

	const value = Array.isArray(raw) ? raw.join(", ") : raw;
	const identity = value as ClientIdentity;

	const spiffeStr = _extractSpiffeUri(value);
	const serviceName = spiffeStr
		? serviceNameFromSpiffeId(spiffeStr)
		: extractCanonicalServiceName(value);

	if (!serviceName) {
		return null;
	}

	return { identity, serviceName };
}

function _extractSpiffeUri(value: string): string | null {
	const match = value.match(/spiffe:\/\/[^\s,]+/);
	const candidate = match?.[0] ?? value;
	return candidate && isSpiffeId(candidate) ? candidate : null;
}
