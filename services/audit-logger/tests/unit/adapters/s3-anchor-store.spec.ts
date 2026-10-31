import {
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { describe, expect, it, jest } from "@jest/globals";
import { S3AnchorStore } from "../../../src/adapters/outbound/anchor/s3-anchor-store";

const NOW = new Date("2026-10-31T14:00:00.000Z");
const HASH = "ab".repeat(32);

function storeWith(send: (command: unknown) => Promise<unknown>) {
	const client = { send: jest.fn(send) };
	const store = new S3AnchorStore({
		client: client as unknown as S3Client,
		bucket: "anchors",
		prefix: "audit-chain/",
		retentionDays: 1827,
		now: () => NOW,
	});
	return { store, send: client.send };
}

describe("S3AnchorStore", () => {
	it("writes each anchor as a compliance-locked object named by sequence and hash", async () => {
		const { store, send } = storeWith(async () => ({}));

		await store.write({ chainSequence: 42, dataHash: HASH });

		const command = send.mock.calls[0][0] as PutObjectCommand;
		expect(command).toBeInstanceOf(PutObjectCommand);
		expect(command.input).toMatchObject({
			Bucket: "anchors",
			Key: `audit-chain/anchors/0000000000000042-${HASH}.json`,
			ObjectLockMode: "COMPLIANCE",
			ObjectLockRetainUntilDate: new Date("2031-11-01T14:00:00.000Z"),
			ChecksumAlgorithm: "SHA256",
		});
		expect(JSON.parse(command.input.Body as string)).toEqual({
			chainSequence: 42,
			dataHash: HASH,
		});
	});

	it("lists the anchors after a sequence, every page, dated by S3", async () => {
		const pages = [
			{
				IsTruncated: true,
				NextContinuationToken: "page-2",
				Contents: [
					{
						Key: `audit-chain/anchors/0000000000000043-${HASH}.json`,
						LastModified: new Date("2026-10-31T10:00:00Z"),
					},
					{ Key: "audit-chain/anchors/README", LastModified: NOW },
				],
			},
			{
				IsTruncated: false,
				Contents: [
					{
						Key: `audit-chain/anchors/0000000000000044-${"cd".repeat(32)}.json`,
						LastModified: new Date("2026-10-31T10:15:00Z"),
					},
				],
			},
		];
		const { store, send } = storeWith(async () => pages.shift());

		const anchors = await store.anchorsAfter(42);

		expect(anchors).toEqual([
			{
				chainSequence: 43,
				dataHash: HASH,
				anchoredAt: new Date("2026-10-31T10:00:00Z"),
			},
			{
				chainSequence: 44,
				dataHash: "cd".repeat(32),
				anchoredAt: new Date("2026-10-31T10:15:00Z"),
			},
		]);
		const [first, second] = send.mock.calls.map(
			([command]) => (command as ListObjectsV2Command).input
		);
		expect(first).toMatchObject({
			Prefix: "audit-chain/anchors/",
			StartAfter: "audit-chain/anchors/0000000000000042.",
		});
		expect(second).toMatchObject({
			ContinuationToken: "page-2",
			StartAfter: undefined,
		});
		// The keys of sequence 42 sort before StartAfter, those of 43 after.
		expect(
			`audit-chain/anchors/0000000000000042-${HASH}.json` < first.StartAfter!
		).toBe(true);
		expect(
			`audit-chain/anchors/0000000000000043-${HASH}.json` > first.StartAfter!
		).toBe(true);
	});

	it("lists every anchor from the start", async () => {
		const { store, send } = storeWith(async () => ({ Contents: [] }));

		await expect(store.anchorsAfter(null)).resolves.toEqual([]);
		expect(
			(send.mock.calls[0][0] as ListObjectsV2Command).input.StartAfter
		).toBeUndefined();
	});

	it("records and reads back loss acknowledgements", async () => {
		const key =
			"audit-chain/acknowledgements/0000000000000004-2026-10-31T14-00-00-000Z.json";
		const { store, send } = storeWith(async (command) => {
			if (command instanceof ListObjectsV2Command) {
				return { Contents: [{ Key: key, LastModified: NOW }] };
			}
			if (command instanceof GetObjectCommand) {
				return {
					Body: {
						transformToString: async () =>
							JSON.stringify({ fromSequence: 4, reason: "restore" }),
					},
				};
			}
			return {};
		});

		await store.acknowledgeLoss(4, "restore");
		const acknowledgements = await store.acknowledgements();

		expect((send.mock.calls[0][0] as PutObjectCommand).input).toMatchObject({
			Key: key,
			ObjectLockMode: "COMPLIANCE",
		});
		expect(acknowledgements).toEqual([
			{ fromSequence: 4, reason: "restore", acknowledgedAt: NOW },
		]);
	});
});
