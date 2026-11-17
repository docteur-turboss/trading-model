import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { normalizeServiceName } from "@trading-model/common/utils/spiffe";
import {
	type IPAddress,
	Port,
	type ServiceId,
} from "@trading-model/primitives/primitives";
import type { HostPort } from "@trading-model/primitives/service-identity";
import type { TokenManager } from "./client/token-manager";
import type { AddressManagerConfig } from "./config/address-manager-config";
import { buildAddressManagerDependencies } from "./config/container";
import type { LifecycleManager } from "./lifecycle-manager";
import type { MetricsCollector } from "./monitoring/metrics-collector";

/** Every service listens on HTTPS port 3000 behind its DNS name (compose service, K8s Service). */
const SERVICE_PORT = Port.of(3000);

/** Address manager facade: registration lifecycle of the service, and where the other services are. */
export default class AddressManager {
	public readonly tokenManager: TokenManager;
	public readonly metricsCollector: MetricsCollector;
	public readonly lifecycleManager: LifecycleManager;
	private readonly _dnsNameMap: Partial<Record<ServiceId, IPAddress>>;

	constructor(config: AddressManagerConfig) {
		const deps = buildAddressManagerDependencies(config);
		this.tokenManager = deps.tokenManager;
		this.metricsCollector = deps.metricsCollector;
		this.lifecycleManager = deps.lifecycleManager;
		this._dnsNameMap = config.dnsNameMap ?? {};
	}

	/**
	 * The service's DNS name (ADR-0072): the platform spreads the connections
	 * over ready pods, no registry is asked. `DNS_NAME_MAP` overrides a name outside
	 * Docker and Kubernetes.
	 */
	findService(serviceName: ServiceInstanceName): Promise<HostPort> {
		const host =
			this._dnsNameMap[serviceName as string as ServiceId] ??
			normalizeServiceName(serviceName);
		return Promise.resolve({ host: host as IPAddress, port: SERVICE_PORT });
	}
}
