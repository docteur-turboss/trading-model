import type { IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import {
	toInstanceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import {
	isSpiffeId,
	serviceNameFromSpiffeId,
} from "@trading-model/common/utils/spiffe";

export class ClientVerifier {
	verifyClient(
		info: { req: IncomingMessage },
		cb: (result: boolean, code?: number, message?: string) => void
	): void {
		const peerService = this._peerSpiffeService(info.req);
		const instanceId = info.req.headers[HTTP_HEADERS.X_INSTANCE_ID] as string;

		// mTLS SVID identity (ADR-0011) is authoritative when present.
		if (peerService) {
			if (!instanceId) {
				cb(false, 400, "Missing x-instance-id header");
				return;
			}
			cb(true);
			return;
		}

		// Fallback for callers without a client certificate (e.g. api-gateway).
		const serviceName = info.req.headers[HTTP_HEADERS.X_SERVICE_NAME] as string;
		if (!(serviceName && instanceId)) {
			cb(false, 400, "Missing x-service-name or x-instance-id headers");
			return;
		}
		cb(true);
	}

	parseConnectionHeaders(req: IncomingMessage): {
		identity: ServiceIdentity;
		topics: Set<string>;
	} {
		const peerService = this._peerSpiffeService(req);
		const serviceName =
			peerService ?? (req.headers[HTTP_HEADERS.X_SERVICE_NAME] as string);
		const instanceId = req.headers[HTTP_HEADERS.X_INSTANCE_ID] as string;
		const topics = _parseTopicsHeader(
			req.headers[HTTP_HEADERS.X_SUBSCRIBED_TOPICS] as string
		);
		return {
			identity: {
				serviceName: toServiceId(serviceName),
				instanceId: toInstanceId(instanceId),
			},
			topics,
		};
	}

	/**
	 * Resolves the caller's service name from the mTLS peer certificate's
	 * SPIFFE URI SAN. Returns null for non-SPIFFE or unauthenticated peers so
	 * header-based identity remains the fallback (dev / api-gateway).
	 */
	private _peerSpiffeService(req: IncomingMessage): string | null {
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
		const subjectAltName = Array.isArray(cert.subjectaltname)
			? cert.subjectaltname.join(", ")
			: cert.subjectaltname;
		const commonName = Array.isArray(cert.subject?.CN)
			? cert.subject.CN.join(", ")
			: cert.subject?.CN;
		const raw = subjectAltName ?? commonName;
		if (!raw) {
			return null;
		}
		const match = raw.match(/spiffe:\/\/[^\s,]+/);
		const spiffeId = match?.[0] ?? raw;
		if (!isSpiffeId(spiffeId)) {
			return null;
		}
		return serviceNameFromSpiffeId(spiffeId)?.toString() ?? null;
	}
}

function _parseTopicsHeader(header: string | undefined): Set<string> {
	if (!header) {
		return new Set();
	}
	return new Set(
		header
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean)
	);
}
