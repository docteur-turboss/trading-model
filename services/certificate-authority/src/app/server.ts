import { createServiceServer } from "@trading-model/server-utils/server/service-server-factory";

import { ENV } from "../config/env";
import { certificateRoutes } from "../routes/certificate.routes";
import { crlRoutes } from "../routes/crl.routes";
import { healthRoutes } from "../routes/health.routes";

function _mountRoutes(app: import("express").Application): void {
	app.use("/", healthRoutes());
	app.use("/api/v1/certificate", certificateRoutes());
	app.use("/api/v1", crlRoutes());
}

export function createServer() {
	return createServiceServer({
		env: ENV,
		routes: _mountRoutes,
	});
}
