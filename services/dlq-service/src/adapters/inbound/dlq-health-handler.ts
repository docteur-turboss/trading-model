import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import {
	HEALTH_STATUS_OK,
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/response-exception";

export interface HealthDeps {
	entries: { count(): Promise<number> };
}

export interface HealthHandlers {
	healthCheck(): Promise<ResponseObject>;
}

export function createHealthHandlers(deps: HealthDeps): HealthHandlers {
	async function healthCheck(): Promise<ResponseObject> {
		const count = await deps.entries.count();
		return sendResponse(
			{ status: HEALTH_STATUS_OK, entries: count },
			HTTP_STATUS.OK
		);
	}

	return { healthCheck };
}
