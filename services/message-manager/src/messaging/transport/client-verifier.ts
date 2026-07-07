import type { IncomingMessage } from "node:http";
import {
	toInstanceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";

export class ClientVerifier {
	verifyClient(
		info: { req: IncomingMessage },
		cb: (result: boolean, code?: number, message?: string) => void
	): void {
		const serviceName = info.req.headers[HTTP_HEADERS.X_SERVICE_NAME] as string;
		const instanceId = info.req.headers[HTTP_HEADERS.X_INSTANCE_ID] as string;
		if (!(serviceName && instanceId)) {
			cb(false, 400, "Missing x-service-name or x-instance-id headers");
			return;
		}
		cb(true);
	}

	parseConnectionHeaders(req: IncomingMessage): {
		identity: ServiceIdentity;
		topics: Set<string>;
	} {
		const serviceName = req.headers[HTTP_HEADERS.X_SERVICE_NAME] as string;
		const instanceId = req.headers[HTTP_HEADERS.X_INSTANCE_ID] as string;
		const topics = _parseTopicsHeader(
			req.headers[HTTP_HEADERS.X_SUBSCRIBED_TOPICS] as string
		);
		return {
			identity: {
				serviceName: toServiceId(serviceName),
				instanceId: toInstanceId(instanceId),
			},
			topics,
		};
	}
}

function _parseTopicsHeader(header: string | undefined): Set<string> {
	if (!header) {
		return new Set();
	}
	return new Set(
		header
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean)
	);
}
