import { ObjectId } from "mongodb";

import { getCollection } from "../config/db";
import { ENV } from "../config/env";
import { DLQ_STATUS } from "./dlq-status";

const DLQ_MAX_CONSECUTIVE_ERRORS = 3;

export interface MarkRetriedParams {
	id: string;
	instanceId: string;
	batchId?: string;
	success?: boolean;
	errorMsg?: string;
}

function _buildAbandonFilter(): Record<string, unknown> {
	return {
		status: { $ne: DLQ_STATUS.ABANDONED },
		processingAt: { $exists: false },
		$or: [
			{ retryCount: { $gte: ENV.DLQ_RETRY_MAX_ATTEMPTS } },
			{ consecutiveErrors: { $gte: DLQ_MAX_CONSECUTIVE_ERRORS } },
		],
	};
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
		const result = await col.updateMany(_buildAbandonFilter(), {
			$set: { status: DLQ_STATUS.ABANDONED, abandonedAt: new Date() },
		});
		return result.modifiedCount;
	}

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
		if (entry?.status === DLQ_STATUS.ABANDONED) {
			return;
		}
		await col.updateOne(
			{ _id: new ObjectId(id), processingInstance: instanceId },
			{
				$set: {
					status: DLQ_STATUS.COMPLETED,
					completedAt: new Date(),
					lastBatchId: batchId,
				},
				$unset: { processingAt: "", processingInstance: "" },
			}
		);
	}

	private _buildFailPipeline(errorMsg?: string): Record<string, unknown>[] {
		return [
			_buildErrorStage(errorMsg),
			_buildRetryStage(errorMsg),
			_buildStatusStage(this),
			{ $unset: ["processingAt", "processingInstance"] },
		];
	}

	private async _markAsFailed(id: string, errorMsg?: string): Promise<void> {
		const col = await getCollection();
		const failFilter: Record<string, unknown> = {
			_id: new ObjectId(id),
			retryCount: { $lt: ENV.DLQ_RETRY_MAX_ATTEMPTS },
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

function _buildErrorStage(errorMsg?: string): Record<string, unknown> {
	return {
		$set: {
			consecutiveErrors: {
				$cond: [
					{ $eq: ["$lastError", errorMsg ?? "Replay failed"] },
					{ $add: [{ $ifNull: ["$consecutiveErrors", 0] }, 1] },
					1,
				],
			},
		},
	};
}

function _buildRetryStage(errorMsg?: string): Record<string, unknown> {
	return {
		$set: {
			retryCount: { $add: ["$retryCount", 1] },
			lastRetryAt: new Date(),
			lastError: errorMsg ?? "Replay failed",
		},
	};
}

function _buildStatusStage(self: DlqRetryManager): Record<string, unknown> {
	return {
		$set: {
			status: {
				$cond: [self._abandonCondition(), DLQ_STATUS.ABANDONED, "$$REMOVE"],
			},
			abandonedAt: {
				$cond: [self._abandonCondition(), new Date(), "$$REMOVE"],
			},
		},
	};
}

export const dlqRetryManager = new DlqRetryManager();
