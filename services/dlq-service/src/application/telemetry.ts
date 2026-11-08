/**
 * First import of the entry point: starts tracing before `express` and `https`
 * are loaded, so the instrumentations can patch them.
 */
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { startTelemetry } from "@trading-model/server-utils/infrastructure/telemetry";

startTelemetry(ServiceInstanceName.DlqService);
