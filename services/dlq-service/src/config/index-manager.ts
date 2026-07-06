import { normalizeError } from "@trading-model/common/utils/errors";
import { type Collection } from "mongodb";

import { logger } from "./logger";

const CRITICAL_INDEX_KEYS = [
	{ retryCount: 1, createdAt: -1 },
	{ createdAt: -1 },
	{ messageId: 1 },
	{ status: 1, retryCount: 1 },
];

export class IndexManager {
	private _missingCriticalIndexes: string[] = [];

	getMissingCriticalIndexes(): string[] {
		return this._missingCriticalIndexes;
	}

	async createCollectionIndexes(col: Collection): Promise<void> {
		const indexSpecs = this._buildIndexSpecs();
		const criticalKeys = new Set(
			CRITICAL_INDEX_KEYS.map((key) => JSON.stringify({ key }))
		);
		const missing = await Promise.all(
			indexSpecs.map((spec) => this._createIndex(col, spec, criticalKeys))
		);
		this._missingCriticalIndexes = missing.filter(Boolean) as string[];
	}

	private async _createIndex(
		col: Collection,
		spec: {
			key: Record<string, 1 | -1>;
			options?: Record<string, unknown>;
		},
		criticalKeys: Set<string>
	): Promise<string | null> {
		const keyStr = JSON.stringify(spec.key);
		try {
			await col.createIndex(spec.key, spec.options);
			return null;
		} catch (err) {
			if (criticalKeys.has(keyStr)) {
				logger.error(
					"Critical index creation failed — queries may perform collection scans",
					{
						index: spec.key,
						error: normalizeError(err).message,
					}
				);
				return keyStr;
			}
			logger.warn("Index creation skipped", {
				index: spec.key,
				error: normalizeError(err).message,
			});
			return null;
		}
	}

	private _buildIndexSpecs(): {
		key: Record<string, 1 | -1>;
		options?: Record<string, unknown>;
	}[] {
		return [
			{ key: { topic: 1, createdAt: -1 } },
			{ key: { createdAt: -1 } },
			{ key: { createdAt: 1 }, options: { expireAfterSeconds: 30 * 86400 } },
			{ key: { retryCount: 1, topic: 1, createdAt: -1 } },
			{ key: { messageId: 1 }, options: { unique: true, sparse: true } },
			{ key: { processingAt: 1 }, options: { sparse: true } },
			{ key: { processingInstance: 1 } },
			{ key: { status: 1, retryCount: 1 } },
			{
				key: { retryCount: 1, createdAt: -1 },
				options: {
					partialFilterExpression: { processingAt: { $exists: false } },
				},
			},
			{
				key: { retryCount: 1, status: 1, createdAt: -1 },
				options: {
					partialFilterExpression: { processingAt: { $exists: false } },
				},
			},
			{ key: { contentHash: 1, status: 1 }, options: { sparse: true } },
		];
	}
}
