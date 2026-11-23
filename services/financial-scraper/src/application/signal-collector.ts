import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import { getLogger } from "@trading-model/contracts/logger-registry";
import {
	SIGNAL_SCHEMA_VERSION,
	Signal,
} from "@trading-model/contracts/wire/signals";
import { sha256Hex } from "@trading-model/crypto/node-crypto";
import {
	SIGNAL_COLLECTIONS_TOTAL,
	SIGNAL_LAST_SUCCESS,
	SIGNAL_NEWEST_OBSERVED,
	SIGNAL_SOURCE_DAILY_REQUESTS,
	SIGNAL_SOURCE_MAX_AGE,
	SIGNAL_SOURCE_QUARANTINED,
	SIGNAL_SOURCES,
} from "../config/metrics";
import { sourceMaxAgeSeconds } from "../domain/cron-period";
import {
	HttpStatusError,
	InvalidPayloadError,
	NOT_MODIFIED,
	type ProtocolWorker,
	type SourceAdapter,
} from "../domain/ports/signal-source.port";
import type { SignalStorePort } from "../domain/ports/signal-store.port";
import { retryAfterMs } from "../domain/retry-after";
import {
	DATE_PLACEHOLDER,
	dailyRequests,
	type Protocol,
	type Source,
	type SourceRequest,
	type Subject,
} from "../domain/signals";
import { SourceQuarantine } from "./source-quarantine";

const FAILURES = [
	"fetch_error",
	"invalid_payload",
	"store_error",
	"skipped_quarantine",
] as const;
type CollectionResult =
	| "success"
	| "not_modified"
	| "not_found"
	| (typeof FAILURES)[number];

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
		SIGNAL_SOURCE_QUARANTINED.set({ source: id }, 0);
	}
	for (const source of sources) {
		SIGNAL_SOURCE_DAILY_REQUESTS.set(
			{ source: source.id },
			dailyRequests(source)
		);
	}
}

/**
 * Sets the freshness gauges of the sources this pod collects: timestamps read
 * back from MySQL (a restart keeps a stale source stale; a source with no
 * signal yet counts from `now`) and the stale threshold.
 */
export async function restoreFreshness(
	sources: readonly Source[],
	store: SignalStorePort,
	now: number
): Promise<void> {
	const newest = await store.newestBySource();
	for (const source of sources) {
		const stored = newest.get(source.id);
		SIGNAL_LAST_SUCCESS.set(
			{ source: source.id },
			(stored?.ingestedAt ?? now) / 1000
		);
		if (stored && stored.observedAt !== null) {
			SIGNAL_NEWEST_OBSERVED.set(
				{ source: source.id },
				stored.observedAt / 1000
			);
		}
		SIGNAL_SOURCE_MAX_AGE.set(
			{ source: source.id },
			sourceMaxAgeSeconds(source)
		);
	}
}

/**
 * Sets `fs_signal_sources` and names the non-commercial sources (ADR-0075).
 * In production an active non-commercial source missing from `accepted`
 * (`SIGNAL_NON_COMMERCIAL_ACCEPTED`) stops the start.
 */
export function recordSourceTerms(
	sources: readonly Source[],
	guard: {
		active: readonly Source[];
		accepted: string;
		production: boolean;
	}
): void {
	SIGNAL_SOURCES.reset();
	for (const { accessPolicy } of sources) {
		SIGNAL_SOURCES.inc({
			terms: accessPolicy.terms,
			commercial_licence: accessPolicy.commercialLicence ?? "n/a",
		});
	}
	const restricted = sources.filter(
		(source) => source.accessPolicy.terms === "non-commercial"
	);
	if (restricted.length > 0) {
		getLogger().warn("Non-commercial signal sources: no commercial use", {
			sources: restricted.map(
				(source) =>
					`${source.id} (licence ${source.accessPolicy.commercialLicence})`
			),
		});
	}
	const accepted = parseCommaSeparated(guard.accepted);
	const refused = guard.active.filter(
		(source) =>
			source.accessPolicy.terms === "non-commercial" &&
			!accepted.includes(source.id)
	);
	if (guard.production && refused.length > 0) {
		throw new Error(
			`Non-commercial signal source(s) ${refused.map((source) => source.id).join(", ")} active in production: add the id to SIGNAL_NON_COMMERCIAL_ACCEPTED once its terms fit your use, or unset its SIGNAL_KEY_* variable`
		);
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
const HOUR_MS = 3_600_000;
/** Consecutive failed ticks that quarantine a source. */
const QUARANTINE_AFTER = 3;

function _expandUrl(url: string, ingestedAt: number): string {
	return url.replace(DATE_PLACEHOLDER, (_placeholder, days?: string) => {
		const date = new Date(
			ingestedAt - Number(days ?? 0) * DAY_MS
		).toISOString();
		return days === undefined
			? date.slice(0, 4)
			: date.slice(0, 10).replace(/-/g, "");
	});
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
 *
 * A source whose fetches keep failing is quarantined (in memory, a restart
 * clears it): after `QUARANTINE_AFTER` failed ticks, at once on 401/403 or on
 * a `Retry-After`, its ticks are skipped until a deadline that doubles from
 * 1 h to 24 h (never earlier than `Retry-After`). The first tick after the
 * deadline is the trial: a tick without fetch failure closes the quarantine.
 * `invalid_payload` and `store_error` do not count: the source answers.
 */
export class SignalCollector {
	constructor(private readonly _deps: SignalCollectorDeps) {}

	private readonly _quarantine = new SourceQuarantine(
		HOUR_MS,
		QUARANTINE_AFTER,
		() => this._deps.now()
	);

	async collect(source: Source): Promise<void> {
		if (this._quarantine.isOpen(source.id)) {
			SIGNAL_COLLECTIONS_TOTAL.inc({
				source: source.id,
				result: "skipped_quarantine",
			});
			return;
		}
		const spacingMs = MINUTE_MS / source.accessPolicy.maxRequestsPerMinute;
		let fetchFailure: Error | undefined;
		for (const [index, request] of source.requests.entries()) {
			// One after the other, at most maxRequestsPerMinute: free sources are not to be burst.
			if (index > 0) {
				await this._deps.sleep(spacingMs);
			}
			const failure = await this._collectRequest(source, request);
			fetchFailure ??= failure;
		}
		this._track(source.id, fetchFailure);
	}

	/** Opens, extends or closes the quarantine of a source after a tick. */
	private _track(sourceId: string, fetchFailure: Error | undefined): void {
		if (!fetchFailure) {
			this._quarantine.clear(sourceId);
			return;
		}
		const http = fetchFailure instanceof HttpStatusError ? fetchFailure : null;
		const refused = http?.status === 401 || http?.status === 403;
		this._quarantine.fail(
			sourceId,
			refused ? 24 * HOUR_MS : retryAfterMs(http?.retryAfter, this._deps.now())
		);
	}

	/**
	 * Fetches and stores one history page (`signal-backfill`). Throws on any
	 * failure, and on an observation the adapter leaves undated: dated at the
	 * first collection, a backfilled value would claim today (ADR-0030).
	 */
	async backfillPage(source: Source, request: SourceRequest): Promise<void> {
		const worker = this._deps.workers[source.protocol];
		const payload = await worker(request, source.accessPolicy.auth, source);
		if (payload === NOT_MODIFIED) {
			return;
		}
		await this._deps.store.save(
			this._toSignals(source, request, payload, this._deps.now(), true)
		);
	}

	private async _collectRequest(
		source: Source,
		request: SourceRequest
	): Promise<Error | undefined> {
		let result: CollectionResult = "fetch_error";
		let fetchFailure: Error | undefined;
		const ingestedAt = this._deps.now();
		try {
			const worker = this._deps.workers[source.protocol];
			const url = _expandUrl(request.url, ingestedAt);
			const payload = await worker(
				{ ...request, url },
				source.accessPolicy.auth,
				source
			);
			if (payload === NOT_MODIFIED) {
				result = "not_modified";
				SIGNAL_LAST_SUCCESS.set({ source: source.id }, ingestedAt / 1000);
				return undefined;
			}
			result = "invalid_payload";
			const signals = this._toSignals(source, request, payload, ingestedAt);
			result = "store_error";
			await this._deps.store.save(signals);
			worker.confirm?.(url);
			result = "success";
			SIGNAL_LAST_SUCCESS.set({ source: source.id }, ingestedAt / 1000);
			// observedAt === ingestedAt: the source gave no date, the gauge would follow the clock.
			const dated = signals.filter((sig) => sig.observedAt !== sig.ingestedAt);
			if (dated.length > 0) {
				SIGNAL_NEWEST_OBSERVED.set(
					{ source: source.id },
					Math.max(...dated.map(({ observedAt }) => Date.parse(observedAt))) /
						1000
				);
			}
			getLogger().debug("Signals collected", {
				context: { source: source.id, count: signals.length },
			});
		} catch (err) {
			if (err instanceof HttpStatusError) {
				// `result` is already "invalid_payload" here: without this, an HTTP failure an adapter finds in a 200 body would skip `_track` and never quarantine.
				result = "fetch_error";
			}
			if (err instanceof InvalidPayloadError) {
				result = "invalid_payload";
			}
			if (
				result === "fetch_error" &&
				source.accessPolicy.notFoundIsEmpty &&
				err instanceof HttpStatusError &&
				err.status === 404
			) {
				result = "not_found";
				SIGNAL_LAST_SUCCESS.set({ source: source.id }, ingestedAt / 1000);
				getLogger().debug("Signal source has no fact", {
					context: { source: source.id, subject: request.subject },
				});
				return undefined;
			}
			if (result === "fetch_error") {
				fetchFailure = err instanceof Error ? err : new Error(String(err));
			}
			getLogger().error("Signal collection failed", {
				context: { source: source.id, subject: request.subject, result },
				error: err,
			});
		} finally {
			SIGNAL_COLLECTIONS_TOTAL.inc({ source: source.id, result });
		}
		return fetchFailure;
	}

	private _toSignals(
		source: Source,
		request: SourceRequest,
		payload: unknown,
		ingestedAt: number,
		requireObservedAt = false
	): Signal[] {
		const adapter = this._deps.adapters.get(source.adapter);
		if (!adapter) {
			throw new Error(`No source adapter named ${source.adapter}`);
		}
		const { subject, dimension } = request;
		const observations = adapter.normalize(payload, {
			params: request.params,
			ingestedAt: requireObservedAt ? undefined : ingestedAt,
		});
		const ingestedIso = new Date(ingestedAt).toISOString();
		// One parse: Signal checks the payload against its dimension, and metric has no transform.
		return observations.map((observation) => {
			if (requireObservedAt && observation.observedAt === undefined) {
				throw new InvalidPayloadError(
					`Adapter ${source.adapter} leaves observedAt to the collection time: no point-in-time history`
				);
			}
			return Signal.parse({
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
				area: "area" in subject ? subject.area : null,
				// Throws on an invalid date: the payload is then invalid.
				observedAt: new Date(
					observation.observedAt ?? ingestedAt
				).toISOString(),
				ingestedAt: ingestedIso,
				confidenceScore: source.reliabilityScore,
				payload: observation.payload,
			});
		});
	}
}
