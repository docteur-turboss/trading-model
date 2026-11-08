import { validateEnv } from "@trading-model/validation/application/services/validate-env";
import { AddressManagerEnvSchema } from "@trading-model/validation/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
import { z } from "zod";

const SYMBOL_PATTERN = /^[A-Z0-9]+$/;

/**
 * Parses SYMBOLS_TO_TRACK as a JSON array (`["BTCUSDT","ETHUSDT"]`) or a CSV
 * list (`BTCUSDT,ETHUSDT`, the TRAINER_SYMBOLS format). A malformed value is a
 * validation error: it must never silently disable market data collection.
 */
function _parseSymbols(value: string): string[] | string {
	const trimmed = value.trim();
	if (trimmed === "") {
		return [];
	}
	let symbols: unknown;
	if (trimmed.startsWith("[")) {
		// biome-ignore lint/plugin: the parse error is returned as the validation message
		try {
			symbols = JSON.parse(trimmed);
		} catch {
			return `SYMBOLS_TO_TRACK is not a valid JSON array: ${value}`;
		}
	} else {
		symbols = trimmed.split(",").map((symbol) => symbol.trim());
	}
	const list = symbols as unknown[];
	const invalid = list.filter(
		(symbol) => typeof symbol !== "string" || !SYMBOL_PATTERN.test(symbol)
	);
	if (invalid.length > 0) {
		return `SYMBOLS_TO_TRACK contains invalid symbols ${JSON.stringify(invalid)} (expected uppercase alphanumerics, e.g. BTCUSDT)`;
	}
	return list as string[];
}

const FINANCIAL_SCRAPER_ENV_SCHEMA = BaseEnvSchema.extend(
	AddressManagerEnvSchema.shape
).extend({
	/** Public market data only: no Binance account or API key (ADR-0026). */
	BINANCE_BASE_URL: z.url().default("https://api.binance.com"),
	SYMBOLS_TO_TRACK: z
		.string()
		.default("[]")
		.transform((value, ctx) => {
			const result = _parseSymbols(value);
			if (typeof result === "string") {
				ctx.addIssue({ code: "custom", message: result });
				return z.NEVER;
			}
			return result;
		}),
	SCRAPE_INTERVAL: z.string().default("*/1 * * * *"),
	/** Runs the scrape cron in this instance; false on HTTP-only replicas. */
	SCRAPE_SCHEDULER_ENABLED: z
		.string()
		.default("true")
		.transform((value) => value === "true" || value === "1"),
	/**
	 * Collects the signal registry sources (ADR-0036) where the scrape cron
	 * runs; false in CI, which must not call the real sources.
	 */
	SIGNAL_COLLECTION_ENABLED: z
		.string()
		.default("true")
		.transform((value) => value === "true" || value === "1"),
	/**
	 * Contact e-mail in the User-Agent of every signal source; SEC EDGAR
	 * answers 403 without one. Set by the deployment only, never committed:
	 * the repository is public. Empty: no contact. Checked by
	 * `createSignalScheduler`: a bad value stops the signals only, not the
	 * Binance collection.
	 */
	SIGNAL_CONTACT_EMAIL: z.string().trim().default(""),
	/**
	 * Kubernetes Lease the collector pods compete for (ADR-0057): only its
	 * holder runs the crons. Empty: no election, this instance collects
	 * (compose, dev: a single collector).
	 */
	COLLECTOR_LEASE_NAME: z.string().trim().default(""),
});

export const ENV = validateEnv(FINANCIAL_SCRAPER_ENV_SCHEMA);
