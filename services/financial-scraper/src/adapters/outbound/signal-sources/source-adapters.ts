import type { SourceAdapter } from "../../../domain/ports/signal-source.port";
import { BINANCE_TICKER_24H } from "./binance-ticker-24h";
import { MASTODON_TAG_HISTORY } from "./mastodon-tag-history";
import { OPEN_METEO_CURRENT } from "./open-meteo-current";
import { SEC_EDGAR_COMPANY_CONCEPT } from "./sec-edgar-company-concept";

/** Source adapters by the name a registry source gives in `adapter`. */
export const SOURCE_ADAPTERS: ReadonlyMap<string, SourceAdapter> = new Map([
	["binance-ticker-24h", BINANCE_TICKER_24H],
	["sec-edgar-company-concept", SEC_EDGAR_COMPANY_CONCEPT],
	["open-meteo-current", OPEN_METEO_CURRENT],
	["mastodon-tag-history", MASTODON_TAG_HISTORY],
]);
