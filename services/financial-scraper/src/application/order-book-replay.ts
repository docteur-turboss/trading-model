import { runCli } from "@trading-model/common/utils/run-cli";

/**
 * Operator command (ADR-0053): prints the stored order book snapshots of a
 * series as JSON lines, oldest first.
 * Usage: order-book-replay <SYMBOL> <MARKET> <SOURCE> <fromIso> <toIso> [limit]
 */
async function _main(): Promise<number> {
	const [symbol, market, source, from, to, limit = "1000"] =
		process.argv.slice(2);
	const [start, end] = [Date.parse(from), Date.parse(to)];
	if (
		!(symbol && market && source && start < end && /^[1-9]\d*$/.test(limit))
	) {
		console.error(
			"Usage: order-book-replay <SYMBOL> <MARKET> <SOURCE> <fromIso> <toIso> [limit] (from < to, limit integer >= 1)"
		);
		return 1;
	}
	const { selectOrderBooks } = await import(
		"../adapters/outbound/persistence/schema/order-book.schema.js"
	);
	const { closeDatabase } = await import("../config/db.js");
	try {
		for (const book of await selectOrderBooks(
			symbol,
			market,
			source,
			start,
			end,
			Number(limit)
		)) {
			console.log(JSON.stringify(book));
		}
		return 0;
	} finally {
		await closeDatabase();
	}
}

if (require.main === module) {
	runCli(_main);
}
