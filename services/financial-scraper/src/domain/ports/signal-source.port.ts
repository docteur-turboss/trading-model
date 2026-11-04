import type { z } from "zod";
import type { Dimension, SourceRequest } from "../signals";

/** What an adapter reads in a payload; the collector completes it into a `Signal`. */
export interface Observation {
	/** Tells this observation from the others of its source, subject and metric; a replay yields the same key. */
	key: string;
	/** Epoch milliseconds, never earlier than the value was public. */
	observedAt: number;
	/** The canonical payload of the request's dimension (`PAYLOADS`), checked by the collector. */
	payload: Record<string, unknown>;
}

export interface AdapterContext {
	/** The request `params`, already checked against the adapter's `params` schema. */
	params: Readonly<Record<string, string>>;
	/** Epoch milliseconds of the collection. */
	ingestedAt: number;
}

/**
 * Normalizer of one source format. Adding a source of a known format is a
 * registry entry; a new format is a new adapter. `normalize` throws when the
 * payload is not what the source documents: never a silent partial result.
 */
export interface SourceAdapter {
	/** Dimensions whose canonical payload this adapter writes. */
	readonly dimensions: readonly Dimension[];
	/** What each request of the source must give in `params`, checked when the registry loads. */
	readonly params?: z.ZodType;
	normalize(payload: unknown, context: AdapterContext): Observation[];
}

/** Fetches one request with its source's protocol; rejects on a transport or HTTP error. */
export type ProtocolWorker = (request: SourceRequest) => Promise<unknown>;
