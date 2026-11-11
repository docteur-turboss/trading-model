/** Series helpers shared by the handlers; no handler dependency, so no import cycle with data-handler.ts. */
export function pushWithMaxSize<TData>(
	array: TData[],
	data: TData,
	maxSize?: number
): TData[] {
	array.push(data);
	if (maxSize !== undefined && array.length > maxSize) {
		// In place: a full series receives one message at a time, no full copy per message.
		array.splice(0, array.length - maxSize);
	}
	return array;
}

/** True when `item` comes after the last item of a series kept in time order. */
export function isAfterLast<TData extends object, TKey extends keyof TData>(
	series: readonly TData[],
	item: Pick<TData, TKey>,
	key: TKey
): boolean {
	const last = series[series.length - 1] as TData | undefined;
	return last === undefined || item[key] > last[key];
}
