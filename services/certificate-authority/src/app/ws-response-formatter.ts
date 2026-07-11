import type { CertificateResponse } from "@trading-model/common/domain/certificate-base";
import type { WebSocket } from "ws";
import { WsMessageType } from "./ws-message-router";

export function buildSignResponsePayload(
	id: string,
	cert: CertificateResponse
): string {
	return JSON.stringify({
		type: WsMessageType.SignResponse,
		id,
		success: true,
		data: {
			certPem: cert.certPem,
			caPem: cert.caPem,
			serialNumber: cert.serialNumber,
			expiresAt: cert.expiresAt.toISOString(),
			fingerprint: cert.fingerprint,
		},
	});
}

export function buildSignErrorPayload(id: string, code: number): string {
	return JSON.stringify({
		type: WsMessageType.SignResponse,
		id,
		success: false,
		error: { message: "Certificate signing failed", code },
	});
}

export function sendJsonError(ws: WebSocket, message: string): void {
	ws.send(JSON.stringify({ type: "error", error: { message } }));
}

export function sendSignError(
	ws: WebSocket,
	id: string,
	message: string
): void {
	ws.send(
		JSON.stringify({
			type: WsMessageType.SignResponse,
			id,
			success: false,
			error: { message },
		})
	);
}

function _buildRateLimitPayload(): string {
	return JSON.stringify({
		type: WsMessageType.SignResponse,
		id: "unknown",
		success: false,
		error: {
			message: "Rate limit exceeded for unauthenticated requests",
			code: 429,
		},
	});
}

export function sendRateLimitError(ws: WebSocket): void {
	ws.send(_buildRateLimitPayload());
}
