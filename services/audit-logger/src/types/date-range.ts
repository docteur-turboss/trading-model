/** A pair of earliest/latest timestamps. */
export interface DateRange<TValue> {
	earliest: TValue | null;
	latest: TValue | null;
}
