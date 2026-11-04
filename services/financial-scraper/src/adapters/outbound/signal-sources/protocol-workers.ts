import type { ProtocolWorker } from "../../../domain/ports/signal-source.port";
import type { Protocol } from "../../../domain/signals";
import { createRestApiWorker } from "./rest-api.worker";

/** The protocols `createProtocolWorkers` has a worker for; the registry refuses a source of another. */
export const WORKER_PROTOCOLS: ReadonlySet<Protocol> = new Set(["rest_api"]);

/** One worker per protocol (§1.3), each sending `userAgent` to the sources. */
export function createProtocolWorkers(
	userAgent: string
): Partial<Record<Protocol, ProtocolWorker>> {
	return { rest_api: createRestApiWorker(userAgent) };
}
