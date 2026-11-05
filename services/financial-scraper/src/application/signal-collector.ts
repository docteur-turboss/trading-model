import { getLogger } from "@trading-model/contracts/logger-registry";
import { sha256Hex } from "@trading-model/crypto/adapters/outbound/node-hash";
import { SIGNAL_COLLECTIONS_TOTAL } from "../config/metrics";
import {
	InvalidPayloadError,
	type ProtocolWorker,
	type SourceAdapter,
} from "../domain/ports/signal-source.port";
import type { SignalStorePort } from "../domain/ports/signal-store.port";
import {
	DATE_PLACEHOLDER,
	type Protocol,
	SIGNAL_SCHEMA_VERSION,
	Signal,
	type Source,
	type SourceRequest,
	type Subject,
} from "../domain/signals";

const FAILURES = ["fetch_error", "invalid_payload", "store_error"] as const;
type CollectionResult = "success" | (typeof FAILURES)[number];

/**
 * Sets the failure counters of every source to 0: a series born at its first
 * failure has no earlier sample, so `increase()` and SignalCollectionFailing
 * would miss that failure.
 */
export function zeroCollectionFailures(sources: readonly Source[]): void {
	for (const { id } of sources) {
		for (const result of FAILURES) {
			SIGNAL_COLLECTIONS_TOTAL.inc({ source: id, result }, 0);
		}
	}
}

export interface SignalCollectorDeps {
	workers: Readonly<Record<Protocol, ProtocolWorker>>;
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
	return sha256Hex(JSON.stringify([sourceId, subject, metric, key]));
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
			const payload = await this._deps.workers[source.protocol]({
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
			if (err instanceof InvalidPayloadError) {
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
		const observations = adapter.normalize(payload, { params: request.params });
		const ingestedIso = new Date(ingestedAt).toISOString();
		// One parse: Signal checks the payload against its dimension, and metric has no transform.
		return observations.map((observation) =>
			Signal.parse({
				id: signalId(
					source.id,
					subject,
					String(observation.payload.metric),
					observation.key
				),
				schemaVersion: SIGNAL_SCHEMA_VERSION,
				sourceId: source.id,
				dimension,
				assetId: "assetId" in subject ? subject.assetId : null,
				sector: "sector" in subject ? subject.sector : null,
				// Throws on an invalid date: the payload is then invalid.
				observedAt: new Date(
					observation.observedAt ?? ingestedAt
				).toISOString(),
				ingestedAt: ingestedIso,
				confidenceScore: source.reliabilityScore,
				payload: observation.payload,
			})
		);
	}
}
