import type { Collection } from "mongodb";

export class DedupInserter {
	async insert(
		col: Collection,
		doc: Record<string, unknown>,
		messageId: string
	): Promise<string> {
		const existing = await col.findOne(
			{ messageId },
			{ projection: { _id: 1 } }
		);
		if (existing) {
			return existing._id.toHexString();
		}

		try {
			const result = await col.insertOne(doc);
			return result.insertedId.toHexString();
		} catch (err: unknown) {
			if (
				err instanceof Error &&
				"code" in err &&
				(err as Record<string, unknown>).code === 11000
			) {
				const existingAfterRace = await col.findOne(
					{ messageId },
					{ projection: { _id: 1 } }
				);
				return existingAfterRace!._id.toHexString();
			}
			throw err;
		}
	}
}
