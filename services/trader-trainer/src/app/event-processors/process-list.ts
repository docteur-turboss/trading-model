import type { DataType } from "../../core/data-handlers/data-types";
import type { MarketDataBuffer } from "../../core/market-data-buffer";
import type { TradingSymbol } from "../../core/market-data-types";

interface ListItem {
	symbol: TradingSymbol;
}

/**
 * Extracts a named list field from the event payload and forwards every item to the
 * buffer under the given data type. Shared by the list-based event processors.
 */
export function processList(
	buffer: MarketDataBuffer,
	data: unknown,
	field: string,
	dataType: DataType
): void {
	const parsed = data as Record<string, ListItem[] | undefined>;
	const items = parsed?.[field];
	if (!items?.length) {
		return;
	}
	for (const item of items) {
		buffer.addData(dataType, item.symbol, item);
	}
}

/**
 * Like {@link processList} but only forwards the first item of the list field.
 */
export function processFirstItem(
	buffer: MarketDataBuffer,
	data: unknown,
	field: string,
	dataType: DataType
): void {
	const parsed = data as Record<string, ListItem[] | undefined>;
	const items = parsed?.[field];
	if (!items?.length) {
		return;
	}
	buffer.addData(dataType, items[0].symbol, items[0]);
}
