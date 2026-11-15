import "./telemetry";
import { createBootstrap } from "@trading-model/server-utils/bootstrap";
import { shutdownTelemetry } from "@trading-model/server-utils/telemetry";

import { createServer } from "./server";

createBootstrap({
	name: "ApiGateway",
	createServer,
	onStop: () => shutdownTelemetry(),
});
