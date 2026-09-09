import type { Topic } from "@trading-model/common/domain/primitives";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import { loadFromRedis } from "../../adapters/outbound/acl-redis-store";
import { getCachedOrLoad } from "./acl-cache";
import { ACL_DENY } from "./acl-constants";

function extractServiceName(req: {
	headers: Record<string, string | string[] | undefined>;
}): string | null {
	const cn = req.headers[HTTP_HEADERS.X_SERVICE_NAME];
	if (cn) {
		return Array.isArray(cn) ? cn[0] : cn;
	}
	return null;
}

export async function authorizeTopic(
	req: { headers: Record<string, string | string[] | undefined> },
	topic: Topic
): Promise<{ allowed: boolean; reason?: string }> {
	const serviceName = extractServiceName(req);
	if (!serviceName) {
		return { allowed: false, reason: "Missing x-service-name header" };
	}

	const allowedServices = await getCachedOrLoad(topic, loadFromRedis);

	if (allowedServices === ACL_DENY) {
		return {
			allowed: false,
			reason: "ACL service unavailable — access denied",
		};
	}

	if (allowedServices.length === 0) {
		return {
			allowed: false,
			reason: `No ACL configured for topic ${topic} — access denied`,
		};
	}

	if (allowedServices.includes(serviceName)) {
		return { allowed: true };
	}

	return {
		allowed: false,
		reason: `Service ${serviceName} not authorized for topic ${topic}`,
	};
}

export { extractServiceName };
