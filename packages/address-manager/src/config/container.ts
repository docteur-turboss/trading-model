import { HttpClient } from "@trading-model/http/http-client";
import { AddressManagerClient } from "../client/address-manager-client";
import { TokenManager } from "../client/token-manager";
import { HeartbeatManager } from "../heartbeat-manager";
import { LifecycleManager } from "../lifecycle-manager";
import {
	DiscoveryResult,
	HEARTBEAT_TOTAL,
	REGISTRATION_TOTAL,
} from "../metrics";
import { MetricsCollector } from "../monitoring/metrics-collector";
import { RegistrationAttemptHandler } from "../registration-attempt-handler";
import { ShutdownHandler } from "../shutdown-handler";
import type { AddressManagerConfig } from "./address-manager-config";

/** Wires every address-manager dependency from the config. */
export function buildAddressManagerDependencies(config: AddressManagerConfig) {
	const httpClient = HttpClient.createWithTls(config.tls);
	const tokenManager = new TokenManager(httpClient, config);
	const addressManagerClient = new AddressManagerClient(
		httpClient,
		tokenManager,
		config
	);
	const registrationManager = new RegistrationAttemptHandler({
		addressManagerClient,
		tokenManager,
		onSuccess: () =>
			REGISTRATION_TOTAL.inc({ result: DiscoveryResult.Success }),
		onFailure: () =>
			REGISTRATION_TOTAL.inc({ result: DiscoveryResult.Failure }),
	});
	const heartbeatManager = new HeartbeatManager({
		addressManagerClient,
		tokenManager,
		onSuccess: () => HEARTBEAT_TOTAL.inc({ result: DiscoveryResult.Success }),
		onFailure: () => HEARTBEAT_TOTAL.inc({ result: DiscoveryResult.Failure }),
	});
	const lifecycleManager = new LifecycleManager({
		registrationManager,
		heartbeatManager,
		shutdownHandler: new ShutdownHandler({
			registrationManager,
			addressManagerClient,
		}),
		serviceName: config.identity.serviceName,
		instanceId: config.identity.instanceId,
		tokenRefreshIntervalMs: config.tokenRefreshIntervalMs,
		ttlRefreshIntervalMs: config.ttlRefreshIntervalMs,
		tokenManager,
		addressManagerClient,
	});
	return {
		tokenManager,
		metricsCollector: new MetricsCollector(),
		lifecycleManager,
	};
}
