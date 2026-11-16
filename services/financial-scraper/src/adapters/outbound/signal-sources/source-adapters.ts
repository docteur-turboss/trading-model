import type { SourceAdapter } from "../../../domain/ports/signal-source.port";
import { CFTC_COT_LEGACY } from "./cftc-cot-legacy";
import { DVF_COMMUNE_SALES } from "./dvf-commune-sales";
import { ECB_SDMX_SERIES } from "./ecb-sdmx-series";
import { EUROSTAT_JSONSTAT } from "./eurostat-jsonstat";
import { FEDERAL_REGISTER_DAILY } from "./federal-register-daily";
import { NWS_LATEST_OBSERVATION } from "./nws-latest-observation";
import { SEC_EDGAR_COMPANY_CONCEPT } from "./sec-edgar-company-concept";
import { WIKIMEDIA_PAGEVIEWS } from "./wikimedia-pageviews";

/** Source adapters by the name a registry source gives in `adapter`. */
export const SOURCE_ADAPTERS: ReadonlyMap<string, SourceAdapter> = new Map([
	["cftc-cot-legacy", CFTC_COT_LEGACY],
	["dvf-commune-sales", DVF_COMMUNE_SALES],
	["ecb-sdmx-series", ECB_SDMX_SERIES],
	["eurostat-jsonstat", EUROSTAT_JSONSTAT],
	["sec-edgar-company-concept", SEC_EDGAR_COMPANY_CONCEPT],
	["federal-register-daily", FEDERAL_REGISTER_DAILY],
	["nws-latest-observation", NWS_LATEST_OBSERVATION],
	["wikimedia-pageviews", WIKIMEDIA_PAGEVIEWS],
]);
