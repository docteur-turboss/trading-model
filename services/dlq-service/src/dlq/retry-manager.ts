import { ObjectId } from "mongodb";

import { getCollection } from "../config/db";
import { ENV } from "../config/env";
import { DLQ_STATUS } from "./dlq-status";
import { RetryPipelineBuilder } from "./retry-pipeline-builder";

function _isEntryAbandoned(
	col: import("mongodb").Collection,
	id: string
): Promise<boolean> {
	return col
		.findOne(
			{ _id: new ObjectId(id) },
			{ projection: { status: 1 } }
		)
		.then((entry) => entry?.status === DLQ_STATUS.ABANDONED);
}

async function _updateEntryCompleted(
	col: import("mongodb").Collection,
	id: string,
	instanceId: string,
	batchId?: string
): Promise<void> {
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

export interface MarkRetriedParams {
	id: string;
	instanceId: string;
	batchId?: string;
	success?: boolean;
	errorMsg?: string;
}

export class DlqRetryManager {
	private readonly _pipelineBuilder = new RetryPipelineBuilder();

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
		const result = await col.updateMany(this._pipelineBuilder.buildAbandonFilter(), {
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
		if (await _isEntryAbandoned(col, id)) return;
		await _updateEntryCompleted(col, id, instanceId, batchId);
	}

	private async _markAsFailed(id: string, errorMsg?: string): Promise<void> {
		const col = await getCollection();
		const failFilter: Record<string, unknown> = {
			_id: new ObjectId(id),
			retryCount: { $lt: ENV.DLQ_RETRY_MAX_ATTEMPTS },
		};
		const updated = await col.findOneAndUpdate(
			failFilter,
			this._pipelineBuilder.buildFailPipeline(errorMsg),
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
