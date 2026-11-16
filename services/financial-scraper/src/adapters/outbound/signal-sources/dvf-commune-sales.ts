import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";

// A CSV cell: always a string, empty when blank.
const Rows = z.array(
	z.object({
		id_mutation: z.string().min(1),
		date_mutation: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		nature_mutation: z.string(),
		valeur_fonciere: z.string(),
		type_local: z.string(),
		surface_reelle_bati: z.string(),
	})
);

const TYPES = { Appartement: "apartment", Maison: "house" } as const;

function _median(values: number[]) {
	const sorted = [...values].sort((left, right) => left - right);
	const mid = sorted.length >> 1;
	const value =
		sorted.length % 2
			? sorted[mid]
			: ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
	return Math.round((value ?? 0) * 100) / 100;
}

/**
 * DVF of one commune and one year, geolocated dataset (data.gouv.fr
 * `geo-dvf`, Licence Ouverte 2.0: reuse allowed with the source named). One
 * sale is one `id_mutation`, spread over one row per lot or parcel, so it is
 * counted once. Kept: a "Vente" with a price and exactly one distinct
 * dwelling (type + built surface); the others (no price, no surface, several
 * dwellings with different surfaces: the price cannot be split) are counted in
 * `details.excluded`. Only per-commune aggregates leave this function: no
 * address, parcel or date of a sale. No kept sale is no signal.
 * The key holds the values, so a corrected publication is a second signal.
 */
export const DVF_COMMUNE_SALES: SourceAdapter = {
	dimensions: ["market"],
	normalize(payload) {
		const rows = Rows.parse(payload);
		const sales = new Map<string, typeof rows>();
		for (const row of rows) {
			if (row.nature_mutation === "Vente" && row.type_local in TYPES) {
				sales.set(row.id_mutation, [
					...(sales.get(row.id_mutation) ?? []),
					row,
				]);
			}
		}
		const prices: Record<"apartment" | "house", number[]> = {
			apartment: [],
			house: [],
		};
		let excluded = 0;
		for (const lots of sales.values()) {
			const dwellings = new Set(
				lots.map((lot) => `${lot.type_local}/${lot.surface_reelle_bati}`)
			);
			const [
				{
					valeur_fonciere = "",
					surface_reelle_bati = "",
					type_local = "",
				} = {},
			] = lots;
			const price = Number(valeur_fonciere);
			const surface = Number(surface_reelle_bati);
			if (dwellings.size !== 1 || !(price > 0) || !(surface > 0)) {
				excluded++;
				continue;
			}
			prices[TYPES[type_local as keyof typeof TYPES]].push(price / surface);
		}
		const count = prices.apartment.length + prices.house.length;
		const year = rows[0]?.date_mutation.slice(0, 4);
		if (count === 0 || !year) {
			return [];
		}
		const measures: [string, number, string][] = [
			["sales_count", count, "sales"],
			...(["apartment", "house"] as const)
				.filter((type) => prices[type].length > 0)
				.map((type): [string, number, string] => [
					`median_price_per_m2_${type}`,
					_median(prices[type]),
					"EUR/m2",
				]),
		];
		return measures.map(([metric, value, unit]) => ({
			key: `${year}:${value}`,
			payload: {
				metric,
				value,
				unit,
				period: { start: `${year}-01-01`, end: `${year}-12-31` },
				details: { excluded },
			},
		}));
	},
};
