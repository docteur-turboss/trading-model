import { sleep } from "@trading-model/common/utils/sleep";
import { logger } from "@trading-model/http/logger";
import { TradingSymbol } from "@trading-model/primitives/primitives";
import type { LeaseApi } from "@trading-model/reliability/kubernetes-lease";
import {
	type LeaderJob,
	Leadership,
	SOLE_INSTANCE_LEASE,
} from "@trading-model/reliability/leadership";
import { z } from "zod";
import { SignalCronScheduler } from "../adapters/inbound/cron/signal.cron";
import {
	insertCandles,
	lastCandleOpenTime,
} from "../adapters/outbound/persistence/schema/candles.schema";
import { insertOrderBook } from "../adapters/outbound/persistence/schema/order-book.schema";
import { insertTicker } from "../adapters/outbound/persistence/schema/ticker24h.schema";
import { MySqlSignalStore } from "../adapters/outbound/persistence/signal-store";
import { createProtocolWorkers } from "../adapters/outbound/signal-sources/protocol-workers";
import { SOURCE_ADAPTERS } from "../adapters/outbound/signal-sources/source-adapters";
import { createMarketDataPersister } from "../application/persist-market-data";
import {
	recordSourceTerms,
	restoreFreshness,
	SignalCollector,
	zeroCollectionFailures,
} from "../application/signal-collector";
import type { QuarantineStore } from "../application/source-quarantine";
import type { WorkerOrchestratorDeps } from "../application/worker-orchestrator";
import type { Source } from "../domain/signals";
import { COLLECTOR_LEADER, SIGNAL_SOURCE_DISABLED } from "./metrics";
import { SIGNAL_REGISTRY } from "./signal-registry";

/** Annotation of the collector Lease holding the Binance ban deadline. */
const QUARANTINE_ANNOTATION = "trading-model/source-quarantine";

const QUARANTINE_RESTORE_RETRY_MS = 2000;

/** Market data persistence use case backed by the MySQL repository. */
export const MarketDataPersister = createMarketDataPersister({
	insertCandles,
	insertOrderBook: (data) => insertOrderBook([data]),
	insertTicker,
});

/**
 * Wires the scrape cycle: market data source and MySQL persistence.
 * Lazy: the source is only needed on the collector.
 */
async function createWorkerOrchestratorDeps(
	store?: QuarantineStore
): Promise<WorkerOrchestratorDeps & { source: { restore(): Promise<void> } }> {
	const { BinanceMarketDataSource } = await import(
		"../adapters/outbound/binance/binance-market-data-source.js"
	);
	return {
		source: new BinanceMarketDataSource(store),
		persist: (snapshot) => MarketDataPersister.persist(snapshot),
		lastCandleOpenTime,
	};
}

export interface ScrapeSchedulerSettings {
	/** Cron expression of the scrape cycle. */
	SCRAPE_INTERVAL: string;
	SYMBOLS_TO_TRACK: string[];
	/** False on HTTP-only replicas: a single collector instance runs the cron. */
	SCRAPE_SCHEDULER_ENABLED: boolean;
}

/**
 * Builds the scrape cron, or null when this instance does not collect
 * (scheduler disabled, or no symbol tracked — the latter logged as a warning).
 * Lazy: the cron pulls in node-cron and the worker pipeline only when needed.
 */
export async function createScrapeScheduler(
	settings: ScrapeSchedulerSettings,
	store?: QuarantineStore
): Promise<LeaderJob | null> {
	if (!settings.SCRAPE_SCHEDULER_ENABLED) {
		logger.info(
			"Scrape scheduler disabled (SCRAPE_SCHEDULER_ENABLED=false): serving HTTP only"
		);
		return null;
	}
	const symbols = settings.SYMBOLS_TO_TRACK.map(TradingSymbol.of);
	if (symbols.length === 0) {
		logger.warn(
			"SYMBOLS_TO_TRACK is empty: market data collection is disabled"
		);
		return null;
	}
	logger.info("Market data collection enabled", {
		symbols,
		schedule: settings.SCRAPE_INTERVAL,
	});
	const [{ ScrapeCronOrchestrator }, deps] = await Promise.all([
		import("../adapters/inbound/cron/scrape.cron.js"),
		createWorkerOrchestratorDeps(store),
	]);
	const cron = new ScrapeCronOrchestrator({
		schedule: settings.SCRAPE_INTERVAL,
		symbols,
		deps,
	});
	if (!store) {
		return cron;
	}
	// The cron starts only once the ban deadline is read back: a cycle before
	// that would call Binance during a ban. A failed read is retried, never skipped.
	let stopped = false;
	return {
		start: () => {
			stopped = false;
			void (async () => {
				while (!stopped) {
					try {
						await deps.source.restore();
						break;
					} catch (error) {
						logger.error("Binance quarantine not restored, retrying", {
							error,
						});
						await sleep(QUARANTINE_RESTORE_RETRY_MS);
					}
				}
				if (!stopped) {
					cron.start();
				}
			})();
		},
		stop: () => {
			stopped = true;
			return cron.stop();
		},
	};
}

export interface SignalSchedulerSettings {
	/** Signals are collected where the scrape cron runs: once, on the collector. */
	SCRAPE_SCHEDULER_ENABLED: boolean;
	SIGNAL_COLLECTION_ENABLED: boolean;
	/** Empty: no contact in the User-Agent (SEC EDGAR then answers 403). */
	SIGNAL_CONTACT_EMAIL: string;
	/** Comma-separated ids of non-commercial sources the operator accepted (ADR-0075). */
	SIGNAL_NON_COMMERCIAL_ACCEPTED: string;
	NODE_ENV: string;
}

/** How the signal sources see the platform. */
const SIGNAL_CLIENT = "automated news analysis";

/**
 * User-Agent of every signal request: "<client> <contact e-mail>", the form
 * SEC EDGAR's fair access policy asks for; without e-mail, the repository URL
 * is the contact NWS and Wikimedia accept.
 */
export function signalUserAgent(contactEmail: string): string {
	return contactEmail
		? `${SIGNAL_CLIENT} ${contactEmail}`
		: `${SIGNAL_CLIENT} (+https://github.com/docteur-turboss/trading-model)`;
}

/**
 * The sources whose key is set. One without its key is skipped with a warning
 * and `fs_signal_source_disabled{reason="missing_key"}` at 1; the others run
 * (CI and dev machines hold no key).
 */
export function scheduledSources(
	sources: readonly Source[],
	env: NodeJS.ProcessEnv
): Source[] {
	return sources.filter(({ id, accessPolicy: { auth } }) => {
		const missing = auth !== "none" && !env[auth.env];
		SIGNAL_SOURCE_DISABLED.set(
			{ source: id, reason: "missing_key" },
			Number(missing)
		);
		if (missing) {
			logger.warn("Signal source not scheduled: its API key is unset", {
				source: id,
				env: auth.env,
			});
		}
		return !missing;
	});
}

/**
 * Builds the cron of the signal registry sources (ADR-0036), or null when
 * this instance does not collect them.
 */
export function createSignalScheduler(
	settings: SignalSchedulerSettings
): LeaderJob | null {
	if (!settings.SCRAPE_SCHEDULER_ENABLED) {
		return null;
	}
	if (!settings.SIGNAL_COLLECTION_ENABLED) {
		logger.info("Signal collection disabled (SIGNAL_COLLECTION_ENABLED=false)");
		return null;
	}
	const contact = settings.SIGNAL_CONTACT_EMAIL;
	if (contact && !z.email().safeParse(contact).success) {
		logger.error(
			"Signal collection disabled: SIGNAL_CONTACT_EMAIL is no e-mail address"
		);
		return null;
	}
	const sources = scheduledSources(SIGNAL_REGISTRY.sources, process.env);
	logger.info("Signal collection enabled", {
		sources: sources.map((source) => source.id),
	});
	const collector = new SignalCollector({
		workers: createProtocolWorkers(signalUserAgent(contact)),
		adapters: SOURCE_ADAPTERS,
		store: MySqlSignalStore,
		now: Date.now,
		sleep,
	});
	recordSourceTerms(SIGNAL_REGISTRY.sources, {
		active: sources,
		accepted: settings.SIGNAL_NON_COMMERCIAL_ACCEPTED,
		production: settings.NODE_ENV === "production",
	});
	zeroCollectionFailures(sources);
	restoreFreshness(sources, MySqlSignalStore, Date.now()).catch((err) =>
		logger.error("Signal freshness gauges not restored from MySQL", {
			error: err,
		})
	);
	return new SignalCronScheduler(sources, collector);
}

export interface CollectorSettings
	extends ScrapeSchedulerSettings,
		SignalSchedulerSettings {
	/** Empty: no election, this instance collects. */
	COLLECTOR_LEASE_NAME: string;
	/** Holder identity in the Lease (the pod name in Kubernetes). */
	INSTANCE_ID: string;
}

/**
 * The scrape and signal crons behind the collector leadership (ADR-0057):
 * they run only while this instance holds the Lease COLLECTOR_LEASE_NAME, or
 * always without one. Null when this instance collects nothing.
 */
export async function createCollector(
	settings: CollectorSettings
): Promise<Leadership | null> {
	if (!settings.SCRAPE_SCHEDULER_ENABLED) {
		return null; // no lease is read on an HTTP-only replica
	}
	let leaseApi: LeaseApi | undefined;
	let store: QuarantineStore | undefined;
	if (settings.COLLECTOR_LEASE_NAME) {
		const { kubernetesLeaseApi, leaseAnnotation } = await import(
			"@trading-model/reliability/kubernetes-lease"
		);
		leaseApi = kubernetesLeaseApi(settings.COLLECTOR_LEASE_NAME);
		const annotation = leaseAnnotation(leaseApi, QUARANTINE_ANNOTATION);
		store = {
			load: async () => JSON.parse((await annotation.get()) ?? "{}"),
			save: (until) => annotation.set(JSON.stringify(until)),
		};
	}
	const schedulers = [
		await createScrapeScheduler(settings, store),
		createSignalScheduler(settings),
	].filter((scheduler) => scheduler !== null);
	if (schedulers.length === 0) {
		return null;
	}
	const collection = {
		start: () => {
			for (const scheduler of schedulers) {
				scheduler.start();
			}
		},
		stop: async () => {
			await Promise.all(schedulers.map((scheduler) => scheduler.stop()));
		},
	};
	let lease: ConstructorParameters<typeof Leadership>[0] = SOLE_INSTANCE_LEASE;
	if (settings.COLLECTOR_LEASE_NAME) {
		logger.info("Collector leader election enabled", {
			lease: settings.COLLECTOR_LEASE_NAME,
			identity: settings.INSTANCE_ID,
		});
		const { KubernetesLease } = await import(
			"@trading-model/reliability/kubernetes-lease"
		);
		lease = new KubernetesLease(settings.INSTANCE_ID, leaseApi as LeaseApi);
	}
	return new Leadership(
		lease,
		collection,
		(leader) => COLLECTOR_LEADER.set(leader),
		"Collector"
	);
}
