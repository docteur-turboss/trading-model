import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import {
	DurationMs,
	toServiceId,
	URLString,
} from "@trading-model/primitives/primitives";
import { logger } from "../../config/logger";
import { REPLAY_DELIVERY_TIMEOUT_MS } from "../../domain/dlq-constants";
import { isShuttingDown } from "../../shared/shutdown-flag";
import type { BatchContext, DlqEntryRef } from "../../shared/types";
import type { ClaimReleaseManager } from "./claim-release-manager";
import type { DlqRetryManager } from "./retry-manager";

/** The Mongo bookkeeping a delivery updates: injected, not imported. */
export interface DeliveryBookkeeping {
	retryManager: Pick<DlqRetryManager, "markRetried">;
	claimRelease: Pick<
		ClaimReleaseManager,
		"incrementRetryCount" | "releaseClaimWithoutCount"
	>;
}

export interface DeliveryContext extends BatchContext, DeliveryBookkeeping {
	client: HttpClient;
	messageManagerUrl: string;
}

async function _deliverMessage(
	entry: DlqEntryRef,
	client: HttpClient,
	messageManagerUrl: string
): Promise<void> {
	if (isShuttingDown()) {
		throw new Error("Server shutting down");
	}
	// Entries from before ADR-0043 name no service: they go through the normal publication, to every subscriber.
	const targeted = entry.service
		? {
				path: "/message/replay",
				body: { service: entry.service, message: entry.message },
			}
		: { path: "/message", body: entry.message };
	await client.post(
		URLString.of(`${messageManagerUrl}${targeted.path}`),
		targeted.body,
		{
			timeoutMs: DurationMs.of(REPLAY_DELIVERY_TIMEOUT_MS),
			serviceName: toServiceId(ServiceInstanceName.MessageManagerService),
		}
	);
}

async function _handleDeliveryMarkFailed(
	options: BatchContext & {
		entryId: string;
		httpError: string;
		bookkeeping: DeliveryBookkeeping;
	}
): Promise<void> {
	const { entryId, instanceId, batchId, httpError, bookkeeping } = options;
	try {
		await bookkeeping.retryManager.markRetried({
			id: entryId,
			instanceId,
			batchId,
			success: false,
			errorMsg: httpError,
		});
	} catch (markErr) {
		await _forceReleaseClaim(entryId, markErr, bookkeeping.claimRelease);
	}
}

async function _forceReleaseClaim(
	entryId: string,
	markErr: unknown,
	claimRelease: DeliveryBookkeeping["claimRelease"]
): Promise<void> {
	logger.error(
		"Failed to mark entry as failed — releasing claim without count",
		{ entryId, error: (markErr as Error).message }
	);
	await _forceIncrementRetry(entryId, claimRelease);
	await _forceReleaseClaimWithoutCount(entryId, claimRelease);
}

async function _forceIncrementRetry(
	entryId: string,
	claimRelease: DeliveryBookkeeping["claimRelease"]
): Promise<void> {
	await claimRelease.incrementRetryCount(entryId).catch((err) => {
		logger.error(
			"CRITICAL: Failed to increment retryCount after markRetried failure",
			{ entryId, error: normalizeError(err).message }
		);
	});
}

async function _forceReleaseClaimWithoutCount(
	entryId: string,
	claimRelease: DeliveryBookkeeping["claimRelease"]
): Promise<void> {
	await claimRelease.releaseClaimWithoutCount(entryId).catch((err) => {
		logger.error("CRITICAL: Failed to release claim after error", {
			entryId,
			error: normalizeError(err).message,
		});
	});
}

async function _markEntrySuccess(
	entry: DlqEntryRef,
	ctx: DeliveryContext
): Promise<void> {
	await ctx.retryManager.markRetried({
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
		const httpError = normalizeError(err).message;
		await _handleDeliveryMarkFailed({
			entryId: entry.id,
			instanceId: ctx.instanceId,
			batchId: ctx.batchId,
			httpError,
			bookkeeping: ctx,
		});
		throw err;
	}
}
