import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { svidReadinessCheck } from "@trading-model/http/readiness";
import { createServiceServer } from "@trading-model/http/service-server-factory";
import { ServiceId } from "@trading-model/primitives/primitives";
import type { Application } from "express";
import { createRouter } from "../adapters/inbound/router";
import { ENV } from "../infrastructure/config/env";
import { hasRetiredScope } from "../shared/api-keys";

export function createServer() {
	if (hasRetiredScope(parseCommaSeparated(ENV.AUTH_TOKENS))) {
		getLogger().warn(
			"scope dlq:write retiré, ignoré ; retire-le de AUTH_TOKENS"
		);
	}
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("api-gateway"),
		routes: (app: Application) => app.use("/", createRouter(ENV)),
		readiness: [svidReadinessCheck(ENV)],
	});
}
