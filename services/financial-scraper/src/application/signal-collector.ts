import { createHash } from "node:crypto";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { SIGNAL_COLLECTIONS_TOTAL } from "../config/metrics";
import type {
	ProtocolWorker,
	SourceAdapter,
} from "../domain/ports/signal-source.port";
import type { SignalStorePort } from "../domain/ports/signal-store.port";
import {
	DATE_PLACEHOLDER,
	PAYLOADS,
	type Protocol,
	SIGNAL_SCHEMA_VERSION,
	Signal,
	type Source,
	type SourceRequest,
	type Subject,
} from "../domain/signals";

export type CollectionResult =
	| "success"
	| "fetch_error"
	| "invalid_payload"
	| "store_error";

export interface SignalCollectorDeps {
	workers: Readonly<Partial<Record<Protocol, ProtocolWorker>>>;
	adapters: ReadonlyMap<string, SourceAdapter>;
	store: SignalStorePort;
	now(): number;
	sleep(ms: number): Promise<void>;
}

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

function _expandUrl(url: string, ingestedAt: number): string {
	return url.replace(DATE_PLACEHOLDER, (_placeholder, days: string) =>
		new Date(ingestedAt - Number(days) * DAY_MS)
			.toISOString()
			.slice(0, 10)
			.replace(/-/g, "")
	);
}

/** Same source, subject, metric and key give the same id: a replay stores nothing twice. */
export function signalId(
	sourceId: string,
	subject: Subject,
	metric: string,
	key: string
): string {
	return createHash("sha256")
		.update(JSON.stringify([sourceId, subject, metric, key]))
		.digest("hex");
}

/**
 * Collects the requests of a source: fetch with the worker of its protocol,
 * normalize with its adapter, check each payload against the canonical
 * schema of the request's dimension, store. A failed request is logged and
 * counted (`fs_signal_collections_total`), the next ones go on: `collect`
 * never rejects.
 */
export class SignalCollector {
	constructor(private readonly _deps: SignalCollectorDeps) {}

	async collect(source: Source): Promise<void> {
		const spacingMs = MINUTE_MS / source.accessPolicy.maxRequestsPerMinute;
		for (const [index, request] of source.requests.entries()) {
			// One after the other, at most maxRequestsPerMinute: free sources are not to be burst.
			if (index > 0) {
				await this._deps.sleep(spacingMs);
			}
			await this._collectRequest(source, request);
		}
	}

	private async _collectRequest(
		source: Source,
		request: SourceRequest
	): Promise<void> {
		let result: CollectionResult = "fetch_error";
		const ingestedAt = this._deps.now();
		try {
			const worker = this._deps.workers[source.protocol];
			if (!worker) {
				throw new Error(`No worker for protocol ${source.protocol}`);
			}
			const payload = await worker({
				...request,
				url: _expandUrl(request.url, ingestedAt),
			});
			result = "invalid_payload";
			const signals = this._toSignals(source, request, payload, ingestedAt);
			result = "store_error";
			await this._deps.store.save(signals);
			result = "success";
			getLogger().debug("Signals collected", {
				context: { source: source.id, count: signals.length },
			});
		} catch (err) {
			// A body that is not JSON is a changed format, not a transport failure.
			// By name: fetch may throw it from another realm than this module's.
			if ((err as { name?: unknown } | null)?.name === "SyntaxError") {
				result = "invalid_payload";
			}
			getLogger().error("Signal collection failed", {
				context: { source: source.id, subject: request.subject, result },
				error: err,
			});
		} finally {
			SIGNAL_COLLECTIONS_TOTAL.inc({ source: source.id, result });
		}
	}

	private _toSignals(
		source: Source,
		request: SourceRequest,
		payload: unknown,
		ingestedAt: number
	): Signal[] {
		const adapter = this._deps.adapters.get(source.adapter);
		if (!adapter) {
			throw new Error(`No source adapter named ${source.adapter}`);
		}
		const { subject, dimension } = request;
		const observations = adapter.normalize(payload, {
			params: request.params,
			ingestedAt,
		});
		return observations.map((observation) => {
			const canonical = PAYLOADS[dimension].parse(observation.payload);
			return Signal.parse({
				id: signalId(source.id, subject, canonical.metric, observation.key),
				schemaVersion: SIGNAL_SCHEMA_VERSION,
				sourceId: source.id,
				dimension,
				assetId: "assetId" in subject ? subject.assetId : null,
				sector: "sector" in subject ? subject.sector : null,
				// Throws on an invalid date: the payload is then invalid.
				observedAt: new Date(observation.observedAt).toISOString(),
				ingestedAt: new Date(ingestedAt).toISOString(),
				confidenceScore: source.reliabilityScore,
				payload: canonical,
			});
		});
	}
}
