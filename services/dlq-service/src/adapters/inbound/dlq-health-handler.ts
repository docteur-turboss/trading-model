import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import {
	HEALTH_STATUS_OK,
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";

export interface HealthDeps {
	entries: { count(): Promise<number> };
	db: { isConnected(): boolean; getMissingCriticalIndexes(): string[] };
	queue: { isAvailable(): boolean };
}

export interface HealthHandlers {
	healthCheck(): Promise<ResponseObject>;
	readyCheck(): Promise<ResponseObject>;
}

export function createHealthHandlers(deps: HealthDeps): HealthHandlers {
	async function healthCheck(): Promise<ResponseObject> {
		const count = await deps.entries.count();
		return sendResponse(
			{ status: HEALTH_STATUS_OK, entries: count },
			HTTP_STATUS.OK
		);
	}

	function _checkDbReady(): ResponseObject | null {
		if (!deps.db.isConnected()) {
			return sendResponse(
				{ status: "not ready", reason: "Database not connected" },
				HTTP_STATUS.SERVICE_UNAVAILABLE
			);
		}
		return null;
	}

	function _checkIndexesReady(): ResponseObject | null {
		const missingIndexes = deps.db.getMissingCriticalIndexes();
		if (missingIndexes.length > 0) {
			return sendResponse(
				{
					status: "degraded",
					reason: `Missing critical indexes: ${missingIndexes.join(", ")}`,
				},
				HTTP_STATUS.SERVICE_UNAVAILABLE
			);
		}
		return null;
	}

	async function _buildReadyResponse(): Promise<ResponseObject> {
		const redisOk = deps.queue.isAvailable();
		const status = redisOk ? "ready" : "degraded";
		const count = await deps.entries.count();
		return sendResponse(
			{ status, entries: count, redis: redisOk ? "connected" : "unavailable" },
			HTTP_STATUS.OK
		);
	}

	function readyCheck(): Promise<ResponseObject> {
		const notReady = _checkDbReady() ?? _checkIndexesReady();
		return notReady ? Promise.resolve(notReady) : _buildReadyResponse();
	}

	return { healthCheck, readyCheck };
}
