import type { ProtocolWorker } from "../../../domain/ports/signal-source.port";
import type { Protocol } from "../../../domain/signals";
import { createRestApiWorker } from "./rest-api.worker";

/** One worker per protocol (§1.3), each sending `userAgent` to the sources. */
export function createProtocolWorkers(
	userAgent: string
): Record<Protocol, ProtocolWorker> {
	return { rest_api: createRestApiWorker(userAgent) };
}
