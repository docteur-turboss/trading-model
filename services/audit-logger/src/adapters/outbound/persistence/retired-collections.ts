import { getLogger } from "@trading-model/contracts/logger-registry";
import type { Db } from "mongodb";

/**
 * Collections of subsystems removed from audit-logger, which earlier versions
 * created at startup. `audit_jobs`: job scheduler, removed by ADR-0029.
 */
export const RETIRED_COLLECTIONS = ["audit_jobs"] as const;

/**
 * Drops each retired collection that exists and is empty. A collection that
 * still holds documents is kept and reported: data is never deleted here.
 */
export async function dropRetiredCollections(db: Db): Promise<void> {
	for (const name of RETIRED_COLLECTIONS) {
		const [existing] = await db
			.listCollections({ name }, { nameOnly: true })
			.toArray();
		if (!existing) {
			continue;
		}
		const documents = await db
			.collection(name)
			.countDocuments({}, { limit: 1 });
		if (documents > 0) {
			getLogger().warn(
				`Retired collection ${name} is not empty: kept, review and drop it by hand (ADR-0029)`
			);
			continue;
		}
		await db.dropCollection(name);
		getLogger().info(`Dropped empty retired collection ${name} (ADR-0029)`);
	}
}
