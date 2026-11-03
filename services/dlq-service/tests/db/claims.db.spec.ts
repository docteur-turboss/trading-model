import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import {
	InstanceId,
	Limit,
	PositiveInt,
	Topic,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { ObjectId } from "mongodb";
import {
	claimReleaseManager,
	dlqClaimManager,
} from "../../src/adapters/outbound/claim-manager";
import {
	DlqStatus,
	dlqRepository,
} from "../../src/adapters/outbound/repository";
import { dlqRetryManager } from "../../src/adapters/outbound/retry-manager";
import { closeDb, getCollection } from "../../src/config/db";

const TOPIC = Topic.of("orders");
const INSTANCES = Array.from({ length: 8 }, (_, i) =>
	InstanceId.of(`dlq-${i}`)
);

function seed(count: number, topic = TOPIC): Promise<string[]> {
	return Promise.all(
		Array.from({ length: count }, (_, i) =>
			dlqRepository.insert({
				topic,
				message: { orderId: `${topic}-${i}` },
				reason: "delivery failed",
				deliveryAttempt: PositiveInt.of(1),
				timestamp: UnixTimestamp.now(),
			})
		)
	);
}

async function rawEntry(id: string) {
	return (await getCollection()).findOne({ _id: new ObjectId(id) });
}

function claimAll(limit: number) {
	return Promise.all(
		INSTANCES.map((instanceId, i) =>
			dlqClaimManager.claimEntriesForRetry({
				limit: Limit.of(limit, 1000),
				batchId: `batch-${i}`,
				instanceId,
			})
		)
	);
}

async function backdateClaim(id: string, ageMs: number): Promise<void> {
	await (await getCollection()).updateOne(
		{ _id: new ObjectId(id) },
		{ $set: { processingAt: new Date(Date.now() - ageMs) } }
	);
}

beforeEach(async () => {
	await (await getCollection()).deleteMany({});
});

afterAll(async () => {
	await closeDb();
});

describe("DLQ claims — concurrent workers on a real MongoDB", () => {
	it("should hand every entry to exactly one of the competing batch claims", async () => {
		const ids = await seed(50);

		const results = await claimAll(50);

		const claimed = results.flatMap((entries) => entries.map((e) => e.id));
		expect(claimed).toHaveLength(50);
		expect(new Set(claimed)).toEqual(new Set(ids));
		for (const [i, entries] of results.entries()) {
			for (const entry of entries) {
				const doc = await rawEntry(entry.id);
				expect(doc?.processingInstance).toBe(INSTANCES[i]);
				expect(doc?.lastBatchId).toBe(`batch-${i}`);
			}
		}
	});

	it("should let only one instance win a single-entry claim", async () => {
		const [id] = await seed(1);

		const results = await Promise.all(
			INSTANCES.map((instanceId, i) =>
				claimReleaseManager.claimEntry(id, {
					batchId: `batch-${i}`,
					instanceId,
				})
			)
		);

		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it("should keep overlapping claims by id disjoint", async () => {
		const ids = await seed(20);

		const results = await Promise.all(
			INSTANCES.map((instanceId, i) =>
				dlqClaimManager.claimEntriesByIds(ids, {
					batchId: `batch-${i}`,
					instanceId,
				})
			)
		);

		const claimed = results.flatMap((entries) => entries.map((e) => e.id));
		expect(claimed.sort()).toEqual([...ids].sort());
	});

	it("should hide claimed entries from the queue until they are released", async () => {
		const ids = await seed(3);
		await claimReleaseManager.claimEntry(ids[0], {
			batchId: "batch-a",
			instanceId: INSTANCES[0],
		});

		await expect(dlqRepository.listQueuable()).resolves.toHaveLength(2);
		await expect(dlqRepository.listActiveClaimIds()).resolves.toEqual([ids[0]]);

		await claimReleaseManager.releaseClaimWithoutCount(ids[0]);

		await expect(dlqRepository.listQueuable()).resolves.toHaveLength(3);
	});
});

describe("DLQ claims — release", () => {
	it("should release only claims older than the stale threshold", async () => {
		const [stale, fresh] = await seed(2);
		for (const id of [stale, fresh]) {
			await claimReleaseManager.claimEntry(id, {
				batchId: "batch-a",
				instanceId: INSTANCES[0],
			});
		}
		await backdateClaim(stale, 120_000);

		await expect(claimReleaseManager.releaseStaleClaims(60_000)).resolves.toBe(
			1
		);

		expect((await rawEntry(stale))?.processingAt).toBeUndefined();
		expect((await rawEntry(fresh))?.processingInstance).toBe(INSTANCES[0]);
		await expect(
			claimReleaseManager.claimEntry(stale, {
				batchId: "batch-b",
				instanceId: INSTANCES[1],
			})
		).resolves.not.toBeNull();
	});

	it("should release only the claims of the given instance", async () => {
		const [mine, theirs] = await seed(2);
		await claimReleaseManager.claimEntry(mine, {
			batchId: "batch-a",
			instanceId: INSTANCES[0],
		});
		await claimReleaseManager.claimEntry(theirs, {
			batchId: "batch-b",
			instanceId: INSTANCES[1],
		});

		await expect(
			claimReleaseManager.releaseClaimsByInstance(INSTANCES[0])
		).resolves.toBe(1);

		expect((await rawEntry(mine))?.processingAt).toBeUndefined();
		expect((await rawEntry(theirs))?.processingInstance).toBe(INSTANCES[1]);
	});
});

describe("DLQ claims — replay outcome", () => {
	it("should never re-claim an entry once its replay completed", async () => {
		const [id] = await seed(1);
		await claimReleaseManager.claimEntry(id, {
			batchId: "batch-a",
			instanceId: INSTANCES[0],
		});

		await dlqRetryManager.markRetried({
			id,
			instanceId: INSTANCES[0],
			batchId: "batch-a",
		});

		expect((await rawEntry(id))?.status).toBe(DlqStatus.Completed);
		await expect(
			claimReleaseManager.claimEntry(id, {
				batchId: "batch-b",
				instanceId: INSTANCES[1],
			})
		).resolves.toBeNull();
		await expect(claimAll(10)).resolves.toEqual(INSTANCES.map(() => []));
	});

	it("should ignore a late completion from an instance that lost its claim", async () => {
		const [id] = await seed(1);
		await claimReleaseManager.claimEntry(id, {
			batchId: "batch-a",
			instanceId: INSTANCES[0],
		});
		await backdateClaim(id, 120_000);
		await claimReleaseManager.releaseStaleClaims(60_000);
		await claimReleaseManager.claimEntry(id, {
			batchId: "batch-b",
			instanceId: INSTANCES[1],
		});

		await dlqRetryManager.markRetried({
			id,
			instanceId: INSTANCES[0],
			batchId: "batch-a",
		});

		const doc = await rawEntry(id);
		expect(doc?.status).toBeUndefined();
		expect(doc?.processingInstance).toBe(INSTANCES[1]);
	});

	it("should ignore a late failure from an instance that lost its claim", async () => {
		const [id] = await seed(1);
		await claimReleaseManager.claimEntry(id, {
			batchId: "batch-a",
			instanceId: INSTANCES[0],
		});
		await backdateClaim(id, 120_000);
		await claimReleaseManager.releaseStaleClaims(60_000);
		await claimReleaseManager.claimEntry(id, {
			batchId: "batch-b",
			instanceId: INSTANCES[1],
		});

		await dlqRetryManager.markRetried({
			id,
			instanceId: INSTANCES[0],
			batchId: "batch-a",
			success: false,
			errorMsg: "timeout",
		});

		const doc = await rawEntry(id);
		expect(doc?.retryCount).toBe(0);
		expect(doc?.processingInstance).toBe(INSTANCES[1]);
	});

	it("should abandon an entry after DLQ_RETRY_MAX_ATTEMPTS failed replays", async () => {
		const [id] = await seed(1);

		for (let attempt = 0; attempt < 3; attempt++) {
			const claimed = await claimReleaseManager.claimEntry(id, {
				batchId: `batch-${attempt}`,
				instanceId: INSTANCES[0],
			});
			expect(claimed).not.toBeNull();
			await dlqRetryManager.markRetried({
				id,
				instanceId: INSTANCES[0],
				success: false,
				errorMsg: `error ${attempt}`,
			});
		}

		const doc = await rawEntry(id);
		expect(doc?.retryCount).toBe(3);
		expect(doc?.status).toBe(DlqStatus.Abandoned);
		expect(doc?.processingAt).toBeUndefined();
		await expect(
			claimReleaseManager.claimEntry(id, {
				batchId: "batch-x",
				instanceId: INSTANCES[0],
			})
		).resolves.toBeNull();
	});
});

describe("DLQ insert — concurrent duplicates", () => {
	it("should store a message once when it is dead-lettered concurrently", async () => {
		const entry = {
			topic: TOPIC,
			message: { orderId: "dup" },
			reason: "delivery failed",
			deliveryAttempt: PositiveInt.of(1),
			timestamp: UnixTimestamp.now(),
		};

		const ids = await Promise.all(
			Array.from({ length: 10 }, () => dlqRepository.insert(entry))
		);

		expect(new Set(ids).size).toBe(1);
		await expect((await getCollection()).countDocuments({})).resolves.toBe(1);
	});
});
