import { logger } from "../config/logger";
import { dlqClaimManager } from "./claim-manager";
import { dlqRetryManager } from "./retry-manager";
import { isShuttingDown } from "./shared/shutdown-flag";
import type { BatchContext, DlqEntryRef } from "./types";

export interface DeliveryContext extends BatchContext {
	client: import("@trading-model/common/config/http-client").HttpClient;
	messageManagerUrl: string;
}

async function _deliverMessage(
	entry: DlqEntryRef,
	client: import("@trading-model/common/config/http-client").HttpClient,
	messageManagerUrl: string
): Promise<void> {
	if (isShuttingDown()) {
		throw new Error("Server shutting down");
	}
	await client.post(`${messageManagerUrl}/message`, entry.message, {
		timeoutMs: 10_000,
		serviceName: "message-manager" as never,
		retryCount: 3,
	});
}

async function _handleDeliveryMarkFailed(
	options: BatchContext & { entryId: string; httpError: string }
): Promise<void> {
	const { entryId, instanceId, batchId, httpError } = options;
	try {
		await dlqRetryManager.markRetried({
			id: entryId,
			instanceId,
			batchId,
			success: false,
			errorMsg: httpError,
		});
	} catch (markErr) {
		await _forceReleaseClaim(entryId, markErr);
	}
}

async function _forceReleaseClaim(
	entryId: string,
	markErr: unknown
): Promise<void> {
	logger.error(
		"Failed to mark entry as failed — releasing claim without count",
		{ entryId, error: (markErr as Error).message }
	);
	await dlqClaimManager.incrementRetryCount(entryId).catch((err) => {
		logger.error(
			"CRITICAL: Failed to increment retryCount after markRetried failure",
			{ entryId, error: (err as Error).message }
		);
	});
	await dlqClaimManager.releaseClaimWithoutCount(entryId).catch((err) => {
		logger.error("CRITICAL: Failed to release claim after error", {
			entryId,
			error: (err as Error).message,
		});
	});
}

async function _markEntrySuccess(
	entry: DlqEntryRef,
	ctx: DeliveryContext
): Promise<void> {
	await dlqRetryManager.markRetried({
		id: entry.id,
		instanceId: ctx.instanceId,
		batchId: ctx.batchId,
		success: true,
	});
}

export async function deliverEntry(
	entry: DlqEntryRef,
	ctx: DeliveryContext
): Promise<void> {
	try {
		await _deliverMessage(entry, ctx.client, ctx.messageManagerUrl);
		await _markEntrySuccess(entry, ctx);
	} catch (err) {
		const httpError = (err as Error).message;
		await _handleDeliveryMarkFailed({
			entryId: entry.id,
			instanceId: ctx.instanceId,
			batchId: ctx.batchId,
			httpError,
		});
		throw err;
	}
}
