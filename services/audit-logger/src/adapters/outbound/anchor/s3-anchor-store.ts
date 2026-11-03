import {
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import type {
	ChainAnchor,
	ChainLossAcknowledgement,
	ChainPoint,
} from "../../../domain/audit-chain";
import type { AnchorStorePort } from "../../../domain/ports/audit-chain.port";

const MS_PER_DAY = 86_400_000;
/** Sequences sort as text once padded: listings come back in chain order. */
const SEQUENCE_DIGITS = 16;
const ANCHOR_KEY = /\/(\d{16})-([0-9a-f]{64})\.json$/;
const ACK_KEY = /\/(\d{16})-[^/]+\.json$/;

export interface S3AnchorStoreOptions {
	client: S3Client;
	bucket: string;
	/** Key prefix, e.g. `audit-chain/`. */
	prefix: string;
	/** Object Lock retention: at least AUDIT_RETENTION_DAYS. */
	retentionDays: number;
	now?: () => Date;
}

function pad(sequence: number): string {
	return String(sequence).padStart(SEQUENCE_DIGITS, "0");
}

/**
 * Anchors in an S3 bucket with Object Lock (ADR-0027). Each anchor is an
 * object in compliance mode: neither its writer nor the account owner can
 * delete or overwrite it before its retention ends. The key carries the
 * sequence and the hash, so a listing is enough to verify; the anchor date is
 * the object's LastModified, set by S3, not by the writer.
 */
export class S3AnchorStore implements AnchorStorePort {
	private readonly _now: () => Date;

	constructor(private readonly _options: S3AnchorStoreOptions) {
		this._now = _options.now ?? (() => new Date());
	}

	async write(point: ChainPoint): Promise<void> {
		await this._put(
			`anchors/${pad(point.chainSequence)}-${point.dataHash}.json`,
			{ chainSequence: point.chainSequence, dataHash: point.dataHash }
		);
	}

	async anchorsAfter(afterSequence: number | null): Promise<ChainAnchor[]> {
		// "." sorts after "-": every key of `afterSequence` itself is skipped.
		const startAfter =
			afterSequence === null
				? undefined
				: `${this._options.prefix}anchors/${pad(afterSequence)}.`;
		const anchors: ChainAnchor[] = [];
		for await (const object of this._list("anchors/", startAfter)) {
			const match = ANCHOR_KEY.exec(object.key);
			if (match) {
				anchors.push({
					chainSequence: Number(match[1]),
					dataHash: match[2],
					anchoredAt: object.lastModified,
				});
			}
		}
		return anchors;
	}

	async acknowledgements(): Promise<ChainLossAcknowledgement[]> {
		const acknowledgements: ChainLossAcknowledgement[] = [];
		for await (const object of this._list("acknowledgements/")) {
			const match = ACK_KEY.exec(object.key);
			if (!match) {
				continue;
			}
			const body = await this._options.client.send(
				new GetObjectCommand({ Bucket: this._options.bucket, Key: object.key })
			);
			const { reason } = JSON.parse(
				(await body.Body?.transformToString()) ?? "{}"
			) as { reason?: string };
			acknowledgements.push({
				fromSequence: Number(match[1]),
				reason: reason ?? "",
				acknowledgedAt: object.lastModified,
			});
		}
		return acknowledgements;
	}

	async acknowledgeLoss(fromSequence: number, reason: string): Promise<void> {
		const at = this._now().toISOString().replace(/[:.]/g, "-");
		await this._put(`acknowledgements/${pad(fromSequence)}-${at}.json`, {
			fromSequence,
			reason,
		});
	}

	private async _put(key: string, body: object): Promise<void> {
		const { client, bucket, prefix, retentionDays } = this._options;
		await client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: `${prefix}${key}`,
				Body: JSON.stringify(body),
				ContentType: "application/json",
				ObjectLockMode: "COMPLIANCE",
				ObjectLockRetainUntilDate: new Date(
					this._now().getTime() + retentionDays * MS_PER_DAY
				),
				// Object Lock refuses a PUT without an integrity checksum.
				ChecksumAlgorithm: "SHA256",
			})
		);
	}

	private async *_list(
		folder: string,
		startAfter?: string
	): AsyncIterable<{ key: string; lastModified: Date }> {
		const { client, bucket, prefix } = this._options;
		let token: string | undefined;
		do {
			const page = await client.send(
				new ListObjectsV2Command({
					Bucket: bucket,
					Prefix: `${prefix}${folder}`,
					StartAfter: token ? undefined : startAfter,
					ContinuationToken: token,
				})
			);
			for (const object of page.Contents ?? []) {
				if (object.Key && object.LastModified) {
					yield { key: object.Key, lastModified: object.LastModified };
				}
			}
			token = page.IsTruncated ? page.NextContinuationToken : undefined;
		} while (token);
	}
}
