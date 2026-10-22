import { generateRandomStr } from "@trading-model/crypto/adapters/outbound/node-random";
import { cryptoTokenAdapter } from "../adapters/outbound/crypto-token.adapter";
import { InstanceStore } from "../adapters/outbound/instance-store";
import { InstanceTokenManager } from "../domain/instance-token-manager";
import type { RegistryMetricsPort } from "../domain/ports/discovery-metrics.port";
import type { IInstanceStore } from "../domain/ports/instance-store.interface";
import { ServiceRegistry } from "../domain/service-registry";
import { prometheusDiscoveryMetrics } from "../infrastructure/monitoring/metrics";

export interface ServiceRegistryOptions {
	/** HMAC secret for instance tokens; a random one is generated when absent. */
	signingSecret?: string;
	/** Defaults to the in-memory InstanceStore. */
	instanceStore?: IInstanceStore;
	/** Defaults to the Prometheus collectors. */
	metrics?: RegistryMetricsPort;
}

/** Wires the domain ServiceRegistry with its concrete adapters. */
export function createServiceRegistry(
	options: ServiceRegistryOptions = {}
): ServiceRegistry {
	return new ServiceRegistry({
		instanceStore: options.instanceStore ?? new InstanceStore(),
		tokenManager: new InstanceTokenManager(
			cryptoTokenAdapter,
			options.signingSecret ?? generateRandomStr()
		),
		metrics: options.metrics ?? prometheusDiscoveryMetrics,
	});
}
