import { ObjectId } from "mongodb";

import { getCollection } from "../config/db";
import { env } from "../config/env";

const DLQ_MAX_CONSECUTIVE_ERRORS = 3;

export interface MarkRetriedParams {
	id: string;
	instanceId: string;
	batchId?: string;
	success?: boolean;
	errorMsg?: string;
}

export class DlqRetryManager {
	async markRetried(params: MarkRetriedParams): Promise<void> {
		const { id, instanceId, batchId, success = true, errorMsg } = params;
		if (success) {
			await this._markAsCompleted(id, instanceId, batchId);
			return;
		}
		await this._markAsFailed(id, errorMsg);
	}

	async abandonExhaustedEntries(): Promise<number> {
		const col = await getCollection();
		const result = await col.updateMany(
			_buildAbandonFilter(),
			{ $set: { status: "abandoned", abandonedAt: new Date() } }
		);
		return result.modifiedCount;
	}
}

function _buildAbandonFilter(): Record<string, unknown> {
	return {
		status: { $ne: "abandoned" },
		processingAt: { $exists: false },
		$or: [
			{ retryCount: { $gte: env.DLQ_RETRY_MAX_ATTEMPTS } },
			{ consecutiveErrors: { $gte: DLQ_MAX_CONSECUTIVE_ERRORS } },
		],
	};
}

export class DlqRetryManager {

	private async _markAsCompleted(
		id: string,
		instanceId: string,
		batchId?: string
	): Promise<void> {
		const col = await getCollection();
		const entry = await col.findOne(
			{ _id: new ObjectId(id) },
			{ projection: { status: 1, processingInstance: 1 } }
		);
		if (entry?.status === "abandoned") {
			return;
		}
		await col.updateOne(
			{ _id: new ObjectId(id), processingInstance: instanceId },
			{
				$set: {
					status: "completed",
					completedAt: new Date(),
					lastBatchId: batchId,
				},
				$unset: { processingAt: "", processingInstance: "" },
			}
		);
	}

	private _abandonCondition(): Record<string, unknown> {
		return {
			$or: [
				{ $gte: ["$retryCount", env.DLQ_RETRY_MAX_ATTEMPTS] },
				{ $gte: ["$consecutiveErrors", DLQ_MAX_CONSECUTIVE_ERRORS] },
			],
		};
	}

	private _buildFailPipeline(errorMsg?: string): Record<string, unknown>[] {
		return [
			{
				$set: {
					consecutiveErrors: {
						$cond: [
							{ $eq: ["$lastError", errorMsg ?? "Replay failed"] },
							{ $add: [{ $ifNull: ["$consecutiveErrors", 0] }, 1] },
							1,
						],
					},
				},
			},
			{
				$set: {
					retryCount: { $add: ["$retryCount", 1] },
					lastRetryAt: new Date(),
					lastError: errorMsg ?? "Replay failed",
				},
			},
			{
				$set: {
					status: {
						$cond: [this._abandonCondition(), "abandoned", "$$REMOVE"],
					},
					abandonedAt: {
						$cond: [this._abandonCondition(), new Date(), "$$REMOVE"],
					},
				},
			},
			{ $unset: ["processingAt", "processingInstance"] },
		];
	}

	private async _markAsFailed(id: string, errorMsg?: string): Promise<void> {
		const col = await getCollection();
		const failFilter: Record<string, unknown> = {
			_id: new ObjectId(id),
			retryCount: { $lt: env.DLQ_RETRY_MAX_ATTEMPTS },
		};
		const updated = await col.findOneAndUpdate(
			failFilter,
			this._buildFailPipeline(errorMsg),
			{ returnDocument: "after", projection: { _id: 1 } }
		);

		if (!updated) {
			await col.updateOne(
				{ _id: new ObjectId(id) },
				{ $unset: { processingAt: "", processingInstance: "" } }
			);
		}
	}
}

export const dlqRetryManager = new DlqRetryManager();
