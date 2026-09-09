import type { Collection } from "mongodb";

export class DedupInserter {
	async insert(
		col: Collection,
		doc: Record<string, unknown>,
		messageId: string
	): Promise<string> {
		const existing = await _findExisting(col, messageId);
		if (existing) {
			return existing;
		}

		try {
			const result = await col.insertOne(doc);
			return result.insertedId.toHexString();
		} catch (err: unknown) {
			if (_isDuplicateKeyError(err)) {
				return _resolveRaceWinner(col, messageId);
			}
			throw err;
		}
	}
}

async function _findExisting(
	col: Collection,
	messageId: string
): Promise<string | null> {
	const existing = await col.findOne({ messageId }, { projection: { _id: 1 } });
	return existing ? existing._id.toHexString() : null;
}

function _isDuplicateKeyError(err: unknown): boolean {
	return (
		err instanceof Error &&
		"code" in err &&
		(err as Record<string, unknown>).code === 11000
	);
}

async function _resolveRaceWinner(
	col: Collection,
	messageId: string
): Promise<string> {
	const existingAfterRace = await col.findOne(
		{ messageId },
		{ projection: { _id: 1 } }
	);
	return existingAfterRace!._id.toHexString();
}
