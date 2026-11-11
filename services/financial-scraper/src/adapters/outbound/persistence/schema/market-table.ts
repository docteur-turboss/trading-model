import type {
	BooleanValueSource,
	DateTimeValueSource,
	NumberValueSource,
} from "ts-sql-query/expressions/values";

import type { Table } from "ts-sql-query/Table";
import type { tableOrViewRef } from "ts-sql-query/utils/symbols";

import {
	createDBConnection,
	DATABASE,
	type DBConnection,
} from "../../../../config/db";
import type { MarketDataPage } from "../../../../domain/market-data.types";

/**
 * Build the batch upsert of a market table: one multi-row
 * `INSERT ... ON DUPLICATE KEY UPDATE`, each `update` column taking the new value.
 * `mapRow` returns the values in `columns` order.
 */
export function defineUpsert<Item>(spec: {
	table: string;
	columns: readonly string[];
	update: readonly string[];
	mapRow: (item: Item) => unknown[];
}): (data: Item[]) => Promise<void> {
	const sql = `
	INSERT INTO ${spec.table}
		(${spec.columns.join(", ")})
	VALUES ?
	ON DUPLICATE KEY UPDATE
		${spec.update.map((col) => `${col} = VALUES(${col})`).join(",\n\t\t")}
`;
	return async (data) => {
		if (!data.length) {
			return;
		}
		await DATABASE.promise().query(sql, [data.map(spec.mapRow)]);
	};
}

type PagedTable = Table<DBConnection, string> & {
	timestamp: DateTimeValueSource<
		Table<DBConnection, string>[typeof tableOrViewRef],
		"required"
	>;
	id: NumberValueSource<
		Table<DBConnection, string>[typeof tableOrViewRef],
		"required"
	>;
};

function toDate(epochMs: number | undefined): Date | undefined {
	return epochMs === undefined ? undefined : new Date(epochMs);
}

/** Query on `table` narrowed by `filter`, the window and the (timestamp, id) cursor of `page`; the caller selects, orders and limits. */
export function pagedQuery<Tbl extends PagedTable>(
	table: Tbl,
	filter: BooleanValueSource<Tbl[typeof tableOrViewRef], "required">,
	page: MarketDataPage
) {
	const after = new Date(page.after?.timestamp ?? 0);
	return createDBConnection()
		.selectFrom(table)
		.where(filter)
		.and(table.timestamp.largeAsIfValue(toDate(page.from)))
		.and(table.timestamp.lessThanIfValue(toDate(page.to)))
		.and(
			table.timestamp
				.greaterThan(after)
				.or(
					table.timestamp
						.equals(after)
						.and(table.id.greaterThan(page.after?.id ?? 0))
				)
				.onlyWhen(page.after !== undefined)
		);
}

/** Filter accepted by {@link pagedQuery} for `TABLE`. */
export type PageFilter<Tbl extends PagedTable> = BooleanValueSource<
	Tbl[typeof tableOrViewRef],
	"required"
>;
