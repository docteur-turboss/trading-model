import { logger } from "@trading-model/common/config/logger";
import type { ClientIdentity } from "@trading-model/common/domain/primitives/string-ids";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { WebSocket } from "ws";
import { z } from "zod";
import { container } from "./index";
import { WsMessageType } from "./ws-message-router";
import type { ConnectionState } from "./rate-limiter";
import {
	buildSignErrorPayload,
	buildSignResponsePayload,
} from "./ws-response-formatter";

export const WS_SIGN_SCHEMA = z.object({
	type: z.literal(WsMessageType.Sign),
	id: z.string().min(1),
	data: z.object({
		serviceId: z.string().min(1),
		csr: z.string().min(1),
		ttlMs: z.number().positive().optional(),
	}),
});

export interface WssSession {
	state: ConnectionState;
	clientIdentity: ClientIdentity | undefined;
	limiterKey: string;
}

export async function handleSignRequest(
	ws: WebSocket,
	signMsg: z.infer<typeof WS_SIGN_SCHEMA>,
	session: WssSession
): Promise<void> {
	try {
		const cert = await container.distributor.requestCertificate(
			signMsg.data.serviceId,
			signMsg.data.csr,
			session.state.tokenProvided ? session.state.bootstrapToken : undefined
		);
		ws.send(buildSignResponsePayload(signMsg.id, cert));
	} catch (err) {
		const statusCode = ((err as Record<string, unknown>).statusCode ??
			500) as number;
		logger.warn("WSS sign error", {
			context: { err: normalizeError(err as Error) },
		});
		ws.send(buildSignErrorPayload(signMsg.id, statusCode));
	}
}
