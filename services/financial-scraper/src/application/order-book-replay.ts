/**
 * Operator command (ADR-0053): prints the stored order book snapshots of a
 * symbol as JSON lines, oldest first.
 * Usage: order-book-replay <SYMBOL> <fromIso> <toIso> [limit]
 */
async function _main(): Promise<number> {
	const [symbol, from, to, limit = "1000"] = process.argv.slice(2);
	const [start, end] = [Date.parse(from), Date.parse(to)];
	if (!symbol || Number.isNaN(start) || Number.isNaN(end)) {
		console.error(
			"Usage: order-book-replay <SYMBOL> <fromIso> <toIso> [limit]"
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
	_main().then(
		(code) => process.exit(code),
		(err: unknown) => {
			console.error(err);
			process.exit(1);
		}
	);
}
