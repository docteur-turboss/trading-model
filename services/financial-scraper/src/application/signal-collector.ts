import { getLogger } from "@trading-model/contracts/logger-registry";
import { sha256Hex } from "@trading-model/crypto/node-crypto";
import {
	SIGNAL_SCHEMA_VERSION,
	Signal,
} from "@trading-model/validation/wire/signals";
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
import {
	DATE_PLACEHOLDER,
	dailyRequests,
	type Protocol,
	type Source,
	type SourceRequest,
	type Subject,
} from "../domain/signals";

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
		if (stored) {
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

/** Sets `fs_signal_sources` and names the non-commercial sources (ADR-0075). */
export function recordSourceTerms(sources: readonly Source[]): void {
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

interface Quarantine {
	failures: number;
	/** Quarantines opened so far: the back-off doubles with each. */
	opened: number;
	until: number;
}

/** `Retry-After` as a delay in ms: delta-seconds or HTTP date; 0 when absent or unreadable. */
function _retryAfterMs(header: string | undefined, now: number): number {
	if (header === undefined) {
		return 0;
	}
	const delay = /^[0-9]+$/.test(header.trim())
		? Number(header) * 1000
		: Date.parse(header) - now;
	return Number.isFinite(delay) && delay > 0 ? delay : 0;
}

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

	private readonly _quarantines = new Map<string, Quarantine>();

	async collect(source: Source): Promise<void> {
		const quarantine = this._quarantines.get(source.id);
		if (quarantine && this._deps.now() < quarantine.until) {
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
		this._track(source.id, fetchFailure, quarantine);
	}

	/** Opens, extends or closes the quarantine of a source after a tick. */
	private _track(
		sourceId: string,
		fetchFailure: Error | undefined,
		previous: Quarantine | undefined
	): void {
		if (!fetchFailure) {
			this._quarantines.delete(sourceId);
			SIGNAL_SOURCE_QUARANTINED.set({ source: sourceId }, 0);
			return;
		}
		const now = this._deps.now();
		const http = fetchFailure instanceof HttpStatusError ? fetchFailure : null;
		const retryAfter = _retryAfterMs(http?.retryAfter, now);
		const refused = http?.status === 401 || http?.status === 403;
		const failures = (previous?.failures ?? 0) + 1;
		if (!refused && retryAfter === 0 && failures < QUARANTINE_AFTER) {
			this._quarantines.set(sourceId, { failures, opened: 0, until: 0 });
			return;
		}
		const opened = (previous?.opened ?? 0) + 1;
		const backoff = refused
			? 24 * HOUR_MS
			: Math.min(24 * HOUR_MS, HOUR_MS * 2 ** (opened - 1));
		const until = now + Math.max(backoff, retryAfter);
		this._quarantines.set(sourceId, { failures, opened, until });
		SIGNAL_SOURCE_QUARANTINED.set({ source: sourceId }, 1);
		getLogger().warn("Signal source quarantined", {
			context: {
				source: sourceId,
				failures,
				until: new Date(until).toISOString(),
			},
		});
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
			if (signals.length > 0) {
				SIGNAL_NEWEST_OBSERVED.set(
					{ source: source.id },
					Math.max(...signals.map(({ observedAt }) => Date.parse(observedAt))) /
						1000
				);
			}
			getLogger().debug("Signals collected", {
				context: { source: source.id, count: signals.length },
			});
		} catch (err) {
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
				area: "area" in subject ? subject.area : null,
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
