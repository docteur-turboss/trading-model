import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/common/config/logger";
import { toServiceId } from "@trading-model/common/domain/primitives";
import { WebSocketClient, type WsMessage } from "./client/websocket-client";
import type { AddressManagerConfig } from "./config/address-manager-config";
import type { IServiceCache } from "./discovery/service-cache.interface";
import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";
import { REGISTRATION_TOTAL } from "./metrics";

export interface WsClientContext {
	config: AddressManagerConfig;
	addressManagerClient: AddressManagerClient;
	tokenManager: TokenManager;
	serviceCache: IServiceCache;
}

export interface AddressManagerDeps {
	addressManagerClient: AddressManagerClient;
	tokenManager: TokenManager;
	wsClient?: WebSocketClient;
}

function _logCacheInvalidationError(serviceName: string, err: unknown): void {
	logger.warn("WebSocket cache invalidation failed", {
		serviceName,
		error: normalizeError(err),
	});
}

function onCacheInvalidateMessage(
	message: WsMessage,
	serviceCache: IServiceCache
): void {
	if (message.type !== "cache.invalidate") {
		return;
	}
	const serviceName = message.payload?.serviceName as string | undefined;
	if (!serviceName) {
		return;
	}
	serviceCache.delete(toServiceId(serviceName)).catch((err: unknown) => {
		_logCacheInvalidationError(serviceName, err);
	});
}

function _handleRegistrationSuccess(
	res: { token?: string } | undefined,
	deps: AddressManagerDeps
): void {
	if (res?.token) {
		deps.tokenManager.setToken(res.token);
		deps.wsClient?.updateToken(res.token);
		REGISTRATION_TOTAL.inc({ result: "success" });
		logger.info("Re-registered after WS auth failure");
	}
}

function _handleRegistrationError(err: unknown): void {
	logger.error("Re-registration after WS auth failure failed", {
		error: normalizeError(err),
	});
}

function onWsAuthFailure(deps: AddressManagerDeps): void {
	logger.warn("WebSocket auth failure — forcing re-registration");
	deps.addressManagerClient
		.registerService()
		.then((res) => _handleRegistrationSuccess(res, deps))
		.catch((err) => _handleRegistrationError(err));
}

function createWsClient(ctx: WsClientContext): WebSocketClient {
	const { config, addressManagerClient, tokenManager, serviceCache } = ctx;
	const deps: AddressManagerDeps = { addressManagerClient, tokenManager };
	let wsClient: WebSocketClient;

	wsClient = new WebSocketClient({
		url: config.wsUrl!,
		subscribedServices: config.wsSubscribedServices ?? ["*"],
		token: tokenManager.getTokenOrUndefined(),
		onMessage: (message) => {
			onCacheInvalidateMessage(message, serviceCache);
		},
		onAuthFailure: () => {
			onWsAuthFailure({ ...deps, wsClient });
		},
	});

	return wsClient;
}

export function maybeCreateWsClient(
	ctx: WsClientContext
): WebSocketClient | undefined {
	if (!ctx.config.wsUrl) {
		return;
	}
	return createWsClient(ctx);
}
