import type { IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import {
	extractCanonicalServiceName,
	parseSpiffeId,
} from "@trading-model/common/utils/spiffe";
import type { ServiceId } from "@trading-model/primitives/primitives";
import type { ClientIdentity } from "@trading-model/primitives/primitives/auth-ids";

const SPIFFE_URI = /spiffe:\/\/[^\s,]+/;

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

	// Only a SPIFFE URI SAN in the namespace of this service's own SVID counts.
	const spiffeId = String(cert.subjectaltname ?? "").match(SPIFFE_URI)?.[0];
	const own = socket.getCertificate?.() as { subjectaltname?: string } | null;
	const ownId = own?.subjectaltname?.match(SPIFFE_URI)?.[0];
	const namespace = ownId ? parseSpiffeId(ownId)?.namespace : undefined;
	if (!(spiffeId && namespace)) {
		return null;
	}

	const serviceName = extractCanonicalServiceName(spiffeId, namespace);
	if (!serviceName) {
		return null;
	}

	return { identity: spiffeId as ClientIdentity, serviceName };
}
