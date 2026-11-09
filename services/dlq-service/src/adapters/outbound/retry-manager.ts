import type { InstanceId } from "@trading-model/primitives/primitives";
import { ObjectId } from "mongodb";
import { RELEASE_CLAIM } from "../../domain/dlq-constants";
import { DlqStatus } from "../../domain/dlq-status";
import { ENV } from "../../infrastructure/config/env";
import type { CollectionProvider } from "./collection-provider";
import { RetryPipelineBuilder } from "./retry-pipeline-builder";

async function _updateEntryCompleted(
	col: import("mongodb").Collection,
	id: string,
	instanceId: InstanceId,
	batchId?: string
): Promise<void> {
	await col.updateOne(
		{
			_id: new ObjectId(id),
			processingInstance: instanceId,
			// An entry abandoned meanwhile stays abandoned.
			status: { $ne: DlqStatus.Abandoned },
		},
		new RetryPipelineBuilder().buildCompletedUpdate(batchId)
	);
}

export interface MarkRetriedParams {
	id: string;
	instanceId: InstanceId;
	batchId?: string;
	success?: boolean;
	errorMsg?: string;
}

export class DlqRetryManager {
	private readonly _pipelineBuilder = new RetryPipelineBuilder();

	constructor(private readonly _getCollection: CollectionProvider) {}

	async markRetried(params: MarkRetriedParams): Promise<void> {
		const { id, instanceId, batchId, success = true, errorMsg } = params;
		if (success) {
			await this._markAsCompleted(id, instanceId, batchId);
			return;
		}
		await this._markAsFailed(id, instanceId, errorMsg);
	}

	async abandonExhaustedEntries(): Promise<number> {
		const col = await this._getCollection();
		const result = await col.updateMany(
			this._pipelineBuilder.buildAbandonFilter(),
			{
				$set: { status: DlqStatus.Abandoned, abandonedAt: new Date() },
			}
		);
		return result.modifiedCount;
	}

	private async _markAsCompleted(
		id: string,
		instanceId: InstanceId,
		batchId?: string
	): Promise<void> {
		const col = await this._getCollection();
		await _updateEntryCompleted(col, id, instanceId, batchId);
	}

	private async _markAsFailed(
		id: string,
		instanceId: InstanceId,
		errorMsg?: string
	): Promise<void> {
		const col = await this._getCollection();
		const failFilter: Record<string, unknown> = {
			_id: new ObjectId(id),
			processingInstance: instanceId,
			retryCount: { $lt: ENV.DLQ_RETRY_MAX_ATTEMPTS },
		};
		const updated = await col.findOneAndUpdate(
			failFilter,
			this._pipelineBuilder.buildFailPipeline(errorMsg),
			{ returnDocument: "after", projection: { _id: 1 } }
		);

		if (!updated) {
			await col.updateOne(
				{ _id: new ObjectId(id), processingInstance: instanceId },
				RELEASE_CLAIM
			);
		}
	}
}
