import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";
import {
	federalHolidays,
	newYorkLocalToUtc,
	notBeforeCollection,
} from "./cftc-cot-legacy";
import { DAY_MS, METRIC_PATTERN } from "./common";

/** `GET https://api.eia.gov/v2/<route>/data/?facets[series][]=<id>`: weekly rows, the value a string. */
const Rows = z.object({
	response: z.object({
		data: z.array(
			z.object({
				period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				value: z
					.string()
					.regex(/^-?\d+(\.\d+)?$/)
					.transform(Number),
				units: z.string().min(1),
			})
		),
	}),
});

/**
 * The Weekly Petroleum Status Report comes out Wednesday 10:30 ET after the
 * Friday it describes (natural gas storage has its own Thursday report, so
 * it takes the collection time), Thursday when a federal holiday falls on Monday to
 * Wednesday (eia.gov/petroleum/supply/weekly/schedule.php).
 */
function _publishedAt(friday: string) {
	const monday = Date.parse(`${friday}T00:00:00Z`) + 3 * DAY_MS;
	const holidays = federalHolidays(new Date(monday).getUTCFullYear());
	const delayed = [0, 1, 2].some((offset) =>
		holidays.has(monday + offset * DAY_MS)
	);
	return newYorkLocalToUtc(monday + (delayed ? 3 : 2) * DAY_MS, 10, 30);
}

/** The series are US-wide: the contextual payload gets the centre of the contiguous states. */
const US_CENTRE = {
	latitude: 39.83,
	longitude: -98.58,
	name: "United States",
};

/**
 * EIA open data (US government work: public domain, "Source: U.S. Energy
 * Information Administration" asked): weekly stocks and production of one
 * series, newest weeks first. Only the newest row takes the report time as
 * `observedAt`: an older row is seen again later and a revised value is
 * published after that time, so those take the collection time. The value is
 * part of the key: a revision is a second signal, the first one stays.
 */
export const EIA_OPEN_DATA: SourceAdapter = {
	dimensions: ["contextual"],
	params: z.object({ metric: z.string().regex(METRIC_PATTERN) }),
	normalize(payload, { params, ingestedAt }) {
		return Rows.parse(payload).response.data.map((row, index) => ({
			key: `${row.period}|${row.value}`,
			observedAt:
				index === 0 && params.metric !== "natural_gas_storage"
					? notBeforeCollection(_publishedAt(row.period), ingestedAt)
					: undefined,
			payload: {
				metric: params.metric,
				value: row.value,
				unit: row.units,
				location: US_CENTRE,
				details: { weekEnding: row.period },
			},
		}));
	},
};
