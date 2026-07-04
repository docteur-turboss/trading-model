import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { logger } from "@trading-model/common/config/logger";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import { generateRandomStr } from "@trading-model/common/crypto/random";
import { normalizeError } from "@trading-model/common/utils/errors";

/**
 * InMemoryRegistryBackend
 *
 * Ephemeral, single-node storage for service instances.
 * Data is lost on restart – suitable for development and
 * single-instance deployments.
 *
 * Replaced by RedisRegistryBackend in multi-node / multi-region
 * production deployments.
 */
export class InMemoryRegistryBackend implements RegistryBackend {
	private readonly _signingSecret: string;
	private _services: Map<string, Map<string, ServiceInstance>> = new Map();
	private _token: Map<string, string> = new Map();

	constructor(signingSecret?: string) {
		this._signingSecret = signingSecret ?? randomBytes(32).toString("hex");
	}

	registerInstance(instance: ServiceInstance): Promise<string> {
		const { serviceName, instanceId } = instance;

		let instances = this._services.get(serviceName);
		if (!instances) {
			instances = new Map();
			this._services.set(serviceName, instances);
		}
		const token = this.generateInstanceToken(instanceId);

		const existing = instances.get(instanceId);
		if (existing) {
			instances.set(instanceId, {
				...existing,
				...instance,
				lastHeartbeat: Date.now(),
			});
		} else {
			instances.set(instanceId, {
				...instance,
				registeredAt: Date.now(),
				lastHeartbeat: Date.now(),
			});
		}

		this._token.set(instanceId, token);
		return Promise.resolve(token);
	}

	updateHeartbeat(
		serviceName: string,
		instanceId: string
	): Promise<number | false> {
		const service = this._services.get(serviceName);
		if (!service) {
			return Promise.resolve(false);
		}

		const instance = service.get(instanceId);
		if (!instance) {
			return Promise.resolve(false);
		}

		instance.lastHeartbeat = Date.now();
		service.set(instanceId, instance);
		return Promise.resolve(instance.ttl);
	}

	updateToken(instanceId: string): Promise<string> {
		const newToken = this.generateInstanceToken(instanceId);
		this._token.set(instanceId, newToken);
		return Promise.resolve(newToken);
	}

	getInstances(serviceName: string): Promise<ServiceInstance[]> {
		const service = this._services.get(serviceName);
		if (!service) {
			return Promise.resolve([]);
		}
		return Promise.resolve([...service.values()]);
	}

	getInstance(
		serviceName: string,
		instanceId: string
	): Promise<ServiceInstance | undefined> {
		return Promise.resolve(this._services.get(serviceName)?.get(instanceId));
	}

	removeInstance(serviceName: string, instanceId: string): Promise<boolean> {
		const service = this._services.get(serviceName);
		if (!service) {
			return Promise.resolve(false);
		}

		const deleted = service.delete(instanceId);

		if (service.size === 0) {
			this._services.delete(serviceName);
		}

		this._token.delete(instanceId);
		return Promise.resolve(deleted);
	}

	listServiceNames(): Promise<string[]> {
		return Promise.resolve([...this._services.keys()]);
	}

	dump(): Promise<Record<string, ServiceInstance[]>> {
		const snapshot: Record<string, ServiceInstance[]> = {};
		for (const [serviceName, instances] of this._services.entries()) {
			snapshot[serviceName] = [...instances.values()];
		}
		return Promise.resolve(snapshot);
	}

	generateInstanceToken(instanceId: string): string {
		const encodedId = Buffer.from(instanceId, "utf8").toString("base64url");
		const timestamp = Buffer.from(`${Date.now()}`, "utf8").toString(
			"base64url"
		);
		const nonce = generateRandomStr();

		const hmac = createHmac("sha256", this._signingSecret)
			.update(`${encodedId}.${timestamp}.${nonce}`)
			.digest("base64url");

		return `${encodedId}.${timestamp}.${nonce}.${hmac}`;
	}

	generateInstanceId(
		serviceName: string,
		address: string,
		port: number
	): string {
		return createHmac("sha256", generateRandomStr())
			.update(`${serviceName}-${address}:${port}-${Date.now()}`)
			.digest("base64");
	}

	validInstanceToken(token: string, instanceId: string): Promise<boolean> {
		const parts = token.split(".");
		if (parts.length !== 4) {
			return Promise.resolve(false);
		}

		const [encodedId, timestamp, nonce, signature] = parts;

		const decodedId = Buffer.from(encodedId, "base64url").toString("utf8");
		if (decodedId !== instanceId) {
			return Promise.resolve(false);
		}

		const expectedHmac = createHmac("sha256", this._signingSecret)
			.update(`${encodedId}.${timestamp}.${nonce}`)
			.digest("base64url");

		try {
			if (!timingSafeEqual(Buffer.from(expectedHmac), Buffer.from(signature))) {
				return Promise.resolve(false);
			}
		} catch (err) {
			logger.warn("Token validation failed", {
				instanceId,
				err: normalizeError(err),
			});
			return Promise.resolve(false);
		}

		const storedToken = this._token.get(instanceId);
		return Promise.resolve(storedToken === token);
	}

	verifyInstanceName(serviceName: string): boolean {
		return (Object.values(ServiceInstanceName) as readonly string[]).includes(
			serviceName
		);
	}

	start(): void {
		// no-op for in-memory backend
	}

	stop(): void {
		// no-op for in-memory backend
	}
}
