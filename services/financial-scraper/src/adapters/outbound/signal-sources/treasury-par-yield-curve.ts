import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";
import { METRIC_PATTERN } from "./common";

const Rows = z.array(
	z.looseObject({ Date: z.string().regex(/^\d\d\/\d\d\/\d{4}$/) })
);

/**
 * One maturity (param `column`, e.g. "10 Yr") of the Daily Treasury Par Yield
 * Curve Rates CSV (home.treasury.gov, work of the US government). A day
 * without a row (holiday) is no signal; a blank or `N/A` cell (maturity not
 * yet published) is skipped; a missing column or a non-numeric cell throws.
 * No release time in the file: the collector stamps the collection time.
 */
export const TREASURY_PAR_YIELD_CURVE: SourceAdapter = {
	dimensions: ["market"],
	params: z.object({
		column: z.string().min(1),
		metric: z.string().regex(METRIC_PATTERN),
	}),
	normalize(payload, { params }) {
		return Rows.parse(payload).flatMap((row) => {
			const cell = row[params.column];
			if (typeof cell !== "string") {
				throw new Error(`Treasury CSV without a "${params.column}" column`);
			}
			if (cell === "" || cell === "N/A") {
				return [];
			}
			const value = z.coerce.number().finite().parse(cell);
			const [month, dayOfMonth, year] = row.Date.split("/");
			const day = `${year}-${month}-${dayOfMonth}`;
			return [
				{
					key: day,
					payload: {
						metric: params.metric,
						value,
						unit: "percent",
						period: { start: day, end: day },
					},
				},
			];
		});
	},
};
