import type { SourceAdapter } from "../../../domain/ports/signal-source.port";
import { CFTC_COT_LEGACY } from "./cftc-cot-legacy";
import { DVF_COMMUNE_SALES } from "./dvf-commune-sales";
import { ECB_SDMX_SERIES } from "./ecb-sdmx-series";
import { EIA_OPEN_DATA } from "./eia-open-data";
import { EUROSTAT_JSONSTAT } from "./eurostat-jsonstat";
import { FEDERAL_REGISTER_DAILY } from "./federal-register-daily";
import { FRED_SERIES_OBSERVATIONS } from "./fred-series-observations";
import { NASA_POWER_DAILY } from "./nasa-power-daily";
import { NWS_LATEST_OBSERVATION } from "./nws-latest-observation";
import { SEC_EDGAR_COMPANY_CONCEPT } from "./sec-edgar-company-concept";
import { TREASURY_PAR_YIELD_CURVE } from "./treasury-par-yield-curve";
import { WIKIMEDIA_PAGEVIEWS } from "./wikimedia-pageviews";

/** Source adapters by the name a registry source gives in `adapter`. */
export const SOURCE_ADAPTERS: ReadonlyMap<string, SourceAdapter> = new Map([
	["cftc-cot-legacy", CFTC_COT_LEGACY],
	["dvf-commune-sales", DVF_COMMUNE_SALES],
	["ecb-sdmx-series", ECB_SDMX_SERIES],
	["eia-open-data", EIA_OPEN_DATA],
	["eurostat-jsonstat", EUROSTAT_JSONSTAT],
	["sec-edgar-company-concept", SEC_EDGAR_COMPANY_CONCEPT],
	["fred-series-observations", FRED_SERIES_OBSERVATIONS],
	["federal-register-daily", FEDERAL_REGISTER_DAILY],
	["nasa-power-daily", NASA_POWER_DAILY],
	["nws-latest-observation", NWS_LATEST_OBSERVATION],
	["treasury-par-yield-curve", TREASURY_PAR_YIELD_CURVE],
	["wikimedia-pageviews", WIKIMEDIA_PAGEVIEWS],
]);
