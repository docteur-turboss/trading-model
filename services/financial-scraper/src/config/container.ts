import { sleep } from "@trading-model/common/utils/sleep";
import { logger } from "@trading-model/http/infrastructure/logger";
import { TradingSymbol } from "@trading-model/primitives/primitives";
import { z } from "zod";
import { SignalCronScheduler } from "../adapters/inbound/cron/signal.cron";
import { MarketDataModel } from "../adapters/outbound/persistence/market-data.model";
import { MySqlSignalStore } from "../adapters/outbound/persistence/signal-store";
import { createProtocolWorkers } from "../adapters/outbound/signal-sources/protocol-workers";
import { SOURCE_ADAPTERS } from "../adapters/outbound/signal-sources/source-adapters";
import { createMarketDataController } from "../application/market-data.controller";
import {
	SignalCollector,
	zeroCollectionFailures,
} from "../application/signal-collector";
import type { WorkerOrchestratorDeps } from "../application/worker-orchestrator";
import { SIGNAL_REGISTRY } from "./signal-registry";

/** Market data persistence use case backed by the MySQL repository. */
export const MarketDataController = createMarketDataController(MarketDataModel);

/**
 * Wires the scrape cycle: market data source, broker publisher, persistence
 * and the publish backlog (both MySQL).
 * Lazy: the source and the broker client are only needed on the collector.
 */
export async function createWorkerOrchestratorDeps(): Promise<WorkerOrchestratorDeps> {
	const [
		{ BinanceMarketDataSource },
		{ BrokerMarketDataPublisher },
		{ MySqlCandlePublishBacklog },
	] = await Promise.all([
		import("../adapters/outbound/binance/binance-market-data-source.js"),
		import("../adapters/outbound/broker/broker-market-data.publisher.js"),
		import("../adapters/outbound/persistence/candle-publish-backlog.js"),
	]);
	return {
		source: new BinanceMarketDataSource(),
		publisher: new BrokerMarketDataPublisher(),
		persist: (snapshot) => MarketDataController.persist(snapshot),
		backlog: MySqlCandlePublishBacklog,
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
export interface ScrapeScheduler {
	start(): void;
	/** Stops the cron and waits for the publishes in flight. */
	stop(): Promise<void>;
}

export async function createScrapeScheduler(
	settings: ScrapeSchedulerSettings
): Promise<ScrapeScheduler | null> {
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
		createWorkerOrchestratorDeps(),
	]);
	return new ScrapeCronOrchestrator({
		schedule: settings.SCRAPE_INTERVAL,
		symbols,
		deps,
	});
}

export interface SignalSchedulerSettings {
	/** Signals are collected where the scrape cron runs: once, on the collector. */
	SCRAPE_SCHEDULER_ENABLED: boolean;
	SIGNAL_COLLECTION_ENABLED: boolean;
	/** Empty: no contact in the User-Agent (SEC EDGAR then answers 403). */
	SIGNAL_CONTACT_EMAIL: string;
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
 * Builds the cron of the signal registry sources (ADR-0036), or null when
 * this instance does not collect them.
 */
export function createSignalScheduler(
	settings: SignalSchedulerSettings
): ScrapeScheduler | null {
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
	logger.info("Signal collection enabled", {
		sources: SIGNAL_REGISTRY.sources.map((source) => source.id),
	});
	const collector = new SignalCollector({
		workers: createProtocolWorkers(signalUserAgent(contact)),
		adapters: SOURCE_ADAPTERS,
		store: MySqlSignalStore,
		now: Date.now,
		sleep,
	});
	zeroCollectionFailures(SIGNAL_REGISTRY.sources);
	return new SignalCronScheduler(SIGNAL_REGISTRY.sources, collector);
}
