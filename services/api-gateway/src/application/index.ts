import "./telemetry";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { shutdownTelemetry } from "@trading-model/server-utils/infrastructure/telemetry";

import { createServer } from "./server";

createBootstrap({
	name: "ApiGateway",
	createServer,
	onStop: () => shutdownTelemetry(),
});
