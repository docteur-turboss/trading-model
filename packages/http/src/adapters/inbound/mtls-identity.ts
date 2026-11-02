import type { IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import {
	extractCanonicalServiceName,
	isSpiffeId,
	serviceNameFromSpiffeId,
} from "@trading-model/common/utils/spiffe";
import { ServiceId } from "@trading-model/primitives/primitives";
import type { ClientIdentity } from "@trading-model/primitives/primitives/auth-ids";
import { DEFAULT_ACL } from "./acl-config";

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

/**
 * Check whether a caller (identified by its service name) is authorized to
 * access the target service. Returns `true` when authorized, `false` otherwise.
 *
 * Uses the default ACL from `acl-config.ts` when no custom map is provided.
 * If `allowedCallers` is provided, it takes precedence over the ACL map.
 */
export function isCallerAuthorized(
	callerServiceName: ServiceId,
	targetService: ServiceId,
	acl?: Record<string, readonly ServiceId[]>,
	allowedCallers?: readonly ServiceId[]
): boolean {
	const allowedList =
		allowedCallers ??
		acl?.[targetService.toString()] ??
		(DEFAULT_ACL as Record<string, readonly ServiceId[]>)[
			targetService.toString()
		];
	if (!allowedList) {
		return false;
	}
	return (
		allowedList.includes(ServiceId.of("*")) ||
		allowedList.includes(callerServiceName)
	);
}

function _extractSpiffeUri(value: string): string | null {
	const match = value.match(/spiffe:\/\/[^\s,]+/);
	const candidate = match?.[0] ?? value;
	return candidate && isSpiffeId(candidate) ? candidate : null;
}
