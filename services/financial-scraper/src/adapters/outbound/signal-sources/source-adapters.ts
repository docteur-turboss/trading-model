import type { SourceAdapter } from "../../../domain/ports/signal-source.port";
import { ECB_SDMX_SERIES } from "./ecb-sdmx-series";
import { NWS_LATEST_OBSERVATION } from "./nws-latest-observation";
import { SEC_EDGAR_COMPANY_CONCEPT } from "./sec-edgar-company-concept";
import { WIKIMEDIA_PAGEVIEWS } from "./wikimedia-pageviews";

/** Source adapters by the name a registry source gives in `adapter`. */
export const SOURCE_ADAPTERS: ReadonlyMap<string, SourceAdapter> = new Map([
	["ecb-sdmx-series", ECB_SDMX_SERIES],
	["sec-edgar-company-concept", SEC_EDGAR_COMPANY_CONCEPT],
	["nws-latest-observation", NWS_LATEST_OBSERVATION],
	["wikimedia-pageviews", WIKIMEDIA_PAGEVIEWS],
]);
