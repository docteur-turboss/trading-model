import { ENV } from "../config/env";
import { DLQ_MAX_CONSECUTIVE_ERRORS } from "./dlq-constants";
import { DLQ_STATUS } from "./dlq-status";

export class RetryPipelineBuilder {
	buildFailPipeline(errorMsg?: string): Record<string, unknown>[] {
		return [
			this._buildErrorStage(errorMsg),
			this._buildRetryStage(errorMsg),
			this._buildStatusStage(),
			{ $unset: ["processingAt", "processingInstance"] },
		];
	}

	buildAbandonFilter(): Record<string, unknown> {
		return {
			status: { $ne: DLQ_STATUS.ABANDONED },
			processingAt: { $exists: false },
			$or: [
				{ retryCount: { $gte: ENV.DLQ_RETRY_MAX_ATTEMPTS } },
				{ consecutiveErrors: { $gte: DLQ_MAX_CONSECUTIVE_ERRORS } },
			],
		};
	}

	buildCompletedUpdate(batchId?: string): Record<string, unknown> {
		return {
			$set: {
				status: DLQ_STATUS.COMPLETED,
				completedAt: new Date(),
				lastBatchId: batchId,
			},
			$unset: { processingAt: "", processingInstance: "" },
		};
	}

	private _buildErrorStage(errorMsg?: string): Record<string, unknown> {
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

	private _buildRetryStage(errorMsg?: string): Record<string, unknown> {
		return {
			$set: {
				retryCount: { $add: ["$retryCount", 1] },
				lastRetryAt: new Date(),
				lastError: errorMsg ?? "Replay failed",
			},
		};
	}

	private _buildStatusStage(): Record<string, unknown> {
		return {
			$set: {
				status: {
					$cond: [this._abandonCondition(), DLQ_STATUS.ABANDONED, "$$REMOVE"],
				},
				abandonedAt: {
					$cond: [this._abandonCondition(), new Date(), "$$REMOVE"],
				},
			},
		};
	}

	private _abandonCondition(): Record<string, unknown> {
		return {
			$or: [
				{ $gte: ["$retryCount", ENV.DLQ_RETRY_MAX_ATTEMPTS] },
				{ $gte: ["$consecutiveErrors", DLQ_MAX_CONSECUTIVE_ERRORS] },
			],
		};
	}
}
