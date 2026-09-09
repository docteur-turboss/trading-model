import type { Document } from "mongodb";
import { DLQ_MAX_CONSECUTIVE_ERRORS } from "../../domain/dlq-constants";
import { DlqStatus } from "../../domain/dlq-status";
import { ENV } from "../../infrastructure/config/env";

export class RetryPipelineBuilder {
	buildFailPipeline(errorMsg?: string): Document[] {
		return [
			this._buildErrorStage(errorMsg),
			this._buildRetryStage(errorMsg),
			this._buildStatusStage(),
			{ $unset: ["processingAt", "processingInstance"] },
		];
	}

	buildAbandonFilter(): Document {
		return {
			status: { $ne: DlqStatus.Abandoned },
			processingAt: { $exists: false },
			$or: [
				{ retryCount: { $gte: ENV.DLQ_RETRY_MAX_ATTEMPTS } },
				{ consecutiveErrors: { $gte: DLQ_MAX_CONSECUTIVE_ERRORS } },
			],
		};
	}

	buildCompletedUpdate(batchId?: string): Document {
		return {
			$set: {
				status: DlqStatus.Completed,
				completedAt: new Date(),
				lastBatchId: batchId,
			},
			$unset: { processingAt: "", processingInstance: "" },
		};
	}

	private _buildErrorStage(errorMsg?: string): Document {
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

	private _buildRetryStage(errorMsg?: string): Document {
		return {
			$set: {
				retryCount: { $add: ["$retryCount", 1] },
				lastRetryAt: new Date(),
				lastError: errorMsg ?? "Replay failed",
			},
		};
	}

	private _buildStatusStage(): Document {
		return {
			$set: {
				status: {
					$cond: [this._abandonCondition(), DlqStatus.Abandoned, "$$REMOVE"],
				},
				abandonedAt: {
					$cond: [this._abandonCondition(), new Date(), "$$REMOVE"],
				},
			},
		};
	}

	private _abandonCondition(): Document {
		return {
			$or: [
				{ $gte: ["$retryCount", ENV.DLQ_RETRY_MAX_ATTEMPTS] },
				{ $gte: ["$consecutiveErrors", DLQ_MAX_CONSECUTIVE_ERRORS] },
			],
		};
	}
}
