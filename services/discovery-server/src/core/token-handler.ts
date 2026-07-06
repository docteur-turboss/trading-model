import { createHmac, randomBytes } from "node:crypto";
import {
	type ServiceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { ServiceEndpoint } from "@trading-model/common/domain/service-identity";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import type Redis from "ioredis";
import type { RedisKeyBuilder } from "./redis-key-builder";
import type { TokenService } from "./token-service";

export class TokenHandler {
	constructor(
		private readonly _redis: Redis,
		private readonly _keyBuilder: RedisKeyBuilder,
		private readonly _tokenService: TokenService
	) {}

	async updateToken(instanceId: string): Promise<string> {
		const newToken = this._tokenService.generateInstanceToken(instanceId);
		await this._redis.set(this._keyBuilder.instanceToken(instanceId), newToken);
		return newToken;
	}

	generateInstanceToken(instanceId: string): string {
		return this._tokenService.generateInstanceToken(instanceId);
	}

	async validInstanceToken({
		token,
		instanceId,
	}: TokenValidation): Promise<boolean> {
		const storedToken = await this._redis.get(
			this._keyBuilder.instanceToken(instanceId)
		);
		return this._tokenService.validInstanceToken(
			token,
			instanceId,
			storedToken ?? undefined
		);
	}

	generateInstanceId({
		serviceName,
		address,
		port,
	}: ServiceEndpoint): ServiceId {
		return toServiceId(
			createHmac("sha256", randomBytes(32).toString("hex"))
				.update(`${serviceName}-${address}:${port}-${Date.now()}`)
				.digest("base64")
		);
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._tokenService.verifyInstanceName(serviceName);
	}
}
