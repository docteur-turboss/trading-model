import {
	HEALTH_STATUS_OK,
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { getMissingCriticalIndexes, isDbConnected } from "../config/db";
import { dlqRedisQueue } from "../config/redis-queue";
import { dlqRepository } from "./repository";

export async function healthCheck(): Promise<ResponseObject> {
	const count = await dlqRepository.count();
	return sendResponse({ status: HEALTH_STATUS_OK, entries: count }, 200);
}

export function readyCheck(): Promise<ResponseObject> {
	const dbResponse = _checkDbReady();
	if (dbResponse) {
		return Promise.resolve(dbResponse);
	}

	const indexResponse = _checkIndexesReady();
	if (indexResponse) {
		return Promise.resolve(indexResponse);
	}

	return _buildReadyResponse();
}

function _checkDbReady(): ResponseObject | null {
	if (!isDbConnected()) {
		return sendResponse(
			{ status: "not ready", reason: "Database not connected" },
			503
		);
	}
	return null;
}

function _checkIndexesReady(): ResponseObject | null {
	const missingIndexes = getMissingCriticalIndexes();
	if (missingIndexes.length > 0) {
		return sendResponse(
			{
				status: "degraded",
				reason: `Missing critical indexes: ${missingIndexes.join(", ")}`,
			},
			503
		);
	}
	return null;
}

async function _buildReadyResponse(): Promise<ResponseObject> {
	const redisOk = dlqRedisQueue.isAvailable();
	const status = redisOk ? "ready" : "degraded";
	const count = await dlqRepository.count();
	return sendResponse(
		{ status, entries: count, redis: redisOk ? "connected" : "unavailable" },
		200
	);
}
