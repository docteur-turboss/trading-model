import { getCollection } from "../config/db";

export async function pruneEntries(maxEntries: number): Promise<number> {
	const col = await getCollection();
	const cutoff = await _findEldestCutoff(col, maxEntries);
	if (!cutoff) {
		return 0;
	}
	return _deleteExcessEntries(col, cutoff);
}

async function _findEldestCutoff(
	col: import("mongodb").Collection,
	maxEntries: number
): Promise<Date | null> {
	const eldest = await col
		.find(
			{},
			{
				sort: { createdAt: -1 },
				skip: maxEntries,
				limit: 1,
				projection: { createdAt: 1 },
			}
		)
		.toArray();
	if (eldest.length === 0) {
		return null;
	}
	return eldest[0].createdAt as Date;
}

async function _deleteExcessEntries(
	col: import("mongodb").Collection,
	cutoff: Date
): Promise<number> {
	const result = await col.deleteMany({
		createdAt: { $lt: cutoff },
		processingAt: { $exists: false },
	});
	return result.deletedCount;
}
