import { getCollection } from "../config/db";

export async function pruneEntries(maxEntries: number): Promise<number> {
	const col = await getCollection();
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
	if (eldest.length === 0) return 0;
	const result = await col.deleteMany({
		createdAt: { $lt: eldest[0].createdAt },
		processingAt: { $exists: false },
	});
	return result.deletedCount;
}
