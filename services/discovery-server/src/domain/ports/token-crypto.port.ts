import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/primitives/primitives";
import type { ServiceEndpoint } from "@trading-model/primitives/service-identity";

export interface InstanceTokenCheck {
	token: string;
	instanceId: InstanceId;
	signingSecret: string;
	storedToken: string | undefined | null;
}

/** Cryptographic primitives the instance token manager depends on. */
export interface TokenCryptoPort {
	generateInstanceId(endpoint: ServiceEndpoint): string;
	generateInstanceToken(instanceId: InstanceId, signingSecret: string): string;
	validInstanceToken(check: InstanceTokenCheck): boolean;
	verifyInstanceName(serviceName: ServiceInstanceName): boolean;
}
