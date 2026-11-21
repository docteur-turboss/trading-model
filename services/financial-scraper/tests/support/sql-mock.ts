import { expect, jest } from "@jest/globals";

/** SQL and parameters the selects sent. */
export const MOCK_SQL: Array<{ query: string; params: unknown[] }> = [];
/** Backticks dropped: MySQL quotes only some identifiers. */
export const SQL_OF = (query: string) => query.replaceAll("`", "");
export const MOCK_QUERY = jest
	.fn<(...args: any[]) => Promise<any>>()
	.mockResolvedValue(undefined);

/** Factory for `jest.mock(".../config/db", ...)`: the real query builder over a recording runner. */
export function createDbMock() {
	const {
		MySqlConnection,
	} = require("ts-sql-query/connections/MySqlConnection");
	const {
		MockQueryRunner,
	} = require("ts-sql-query/queryRunners/MockQueryRunner");
	const runner = new MockQueryRunner(
		(_type: string, query: string, params: unknown[]) => {
			MOCK_SQL.push({ query, params: [...params] });
			return [];
		}
	);
	const connection = class extends MySqlConnection<"DBConnection"> {};
	return {
		createDBConnection: () => new (connection as any)(runner),
		DATABASE: {
			promise: jest.fn((..._args: any[]) => ({ query: MOCK_QUERY })),
		},
	};
}

/** Runs a select and checks it pages `table` by (timestamp, id) with `predicate` and the limit. */
export async function expectPagedSelect(
	select: (opts: { limit: number }) => Promise<unknown>,
	table: string,
	predicate: string
) {
	expect(await select({ limit: 3 })).toEqual([]);
	const [{ query, params }] = MOCK_SQL;
	const sql = SQL_OF(query);
	expect(sql).toContain(`from ${table}`);
	expect(sql).toContain(predicate);
	expect(sql).toMatch(/order by timestamp, id limit \?$/);
	expect(params.at(-1)).toBe(3);
}
