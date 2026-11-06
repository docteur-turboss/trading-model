import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { toInstanceId } from "@trading-model/primitives/primitives";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import {
	initializeTelemetry,
	shutdownTelemetry,
} from "@trading-model/server-utils/infrastructure/telemetry";

import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

createBootstrap({
	name: "ApiGateway",
	createServer,
	onStart: () => {
		initializeTelemetry({
			serviceName: ServiceInstanceName.ApiGatewayService,
			serviceVersion: process.env.APP_VERSION ?? "1.0.0",
			instanceId: toInstanceId(process.env.INSTANCE_ID ?? "api-gateway-1"),
			otlpEndpoint: ENV.OTEL_EXPORTER_OTLP_ENDPOINT,
		});
	},
	onStop: () => shutdownTelemetry(),
});
