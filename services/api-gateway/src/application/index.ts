import "./telemetry";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { shutdownTelemetry } from "@trading-model/http/telemetry";

import { createServer } from "./server";

createBootstrap({
	name: "ApiGateway",
	createServer,
	onStop: () => shutdownTelemetry(),
});
