import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";

const HOUR_MS = 3_600_000;
/**
 * EDGAR filing dates are US Eastern: the filing day is over, everywhere, by
 * 05:00 UTC the next day.
 */
const END_OF_FILING_DAY_MS = 29 * HOUR_MS;

const Fact = z.object({
	/** Absent for an instant (a balance at `end`). */
	start: z.iso.date().optional(),
	end: z.iso.date(),
	val: z.number(),
	accn: z.string().min(1),
	fy: z.number().int().nullish(),
	fp: z.string().nullish(),
	form: z.string().min(1),
	filed: z.iso.date(),
	frame: z.string().optional(),
});

/** `GET https://data.sec.gov/api/xbrl/companyconcept/CIK<10 digits>/<taxonomy>/<tag>.json`. */
const CompanyConcept = z.object({
	taxonomy: z.string().min(1),
	tag: z.string().min(1),
	/** Facts by unit (`USD`, `USD/shares`...). */
	units: z.record(z.string(), z.array(Fact)),
});

/**
 * SEC EDGAR XBRL facts of one concept of one company, every filing that
 * reported them. A fact is observed once its filing is public, not at the end
 * of its period: training on it earlier would leak the future. A restated
 * value is another fact (other filing), so both stay.
 */
export const SEC_EDGAR_COMPANY_CONCEPT: SourceAdapter = {
	normalize(payload) {
		const concept = CompanyConcept.parse(payload);
		const metric = `${concept.taxonomy}:${concept.tag}`;
		return Object.entries(concept.units).flatMap(([unit, facts]) =>
			facts.map((fact) => ({
				metric,
				value: fact.val,
				unit,
				observedAt: Date.parse(fact.filed) + END_OF_FILING_DAY_MS,
				key: [fact.accn, fact.start ?? "", fact.end, unit].join("|"),
				attributes: {
					periodStart: fact.start ?? null,
					periodEnd: fact.end,
					form: fact.form,
					fiscalYear: fact.fy ?? null,
					fiscalPeriod: fact.fp ?? null,
					accessionNumber: fact.accn,
					frame: fact.frame ?? null,
				},
			}))
		);
	},
};
