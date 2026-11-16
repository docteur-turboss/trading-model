import type { SourceAdapter } from "../../../domain/ports/signal-source.port";
import { CFTC_COT_LEGACY } from "./cftc-cot-legacy";
import { ECB_SDMX_SERIES } from "./ecb-sdmx-series";
import { FRED_SERIES_OBSERVATIONS } from "./fred-series-observations";
import { FEDERAL_REGISTER_DAILY } from "./federal-register-daily";
import { NWS_LATEST_OBSERVATION } from "./nws-latest-observation";
import { SEC_EDGAR_COMPANY_CONCEPT } from "./sec-edgar-company-concept";
import { WIKIMEDIA_PAGEVIEWS } from "./wikimedia-pageviews";

/** Source adapters by the name a registry source gives in `adapter`. */
export const SOURCE_ADAPTERS: ReadonlyMap<string, SourceAdapter> = new Map([
	["cftc-cot-legacy", CFTC_COT_LEGACY],
	["ecb-sdmx-series", ECB_SDMX_SERIES],
	["sec-edgar-company-concept", SEC_EDGAR_COMPANY_CONCEPT],
	["fred-series-observations", FRED_SERIES_OBSERVATIONS],
	["federal-register-daily", FEDERAL_REGISTER_DAILY],
	["nws-latest-observation", NWS_LATEST_OBSERVATION],
	["wikimedia-pageviews", WIKIMEDIA_PAGEVIEWS],
]);
