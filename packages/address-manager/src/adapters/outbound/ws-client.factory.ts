import { logger } from "@trading-model/common/config/logger";
import {
	type ServiceId,
	toServiceId,
	URLString,
} from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import { DiscoveryWsMessageType } from "@trading-model/validation/adapters/inbound/discovery-ws-message.types";
import type { TokenManager } from "../../application/client/token-manager";
import { WsAuthFailureHandler } from "../../application/ws-auth-failure-handler";
import type { AddressManagerConfig } from "../../domain/config/address-manager-config";
import type { IServiceCache } from "../../domain/discovery/service-cache.interface";
import type { ServiceClientDeps } from "../../domain/types";
import type { AddressManagerClient } from "./client/address-manager-client";
import { WebSocketClient, type WsMessage } from "./client/websocket-client";

export interface WsClientContext {
	config: AddressManagerConfig;
	addressManagerClient: AddressManagerClient;
	tokenManager: TokenManager;
	serviceCache: IServiceCache;
}

function _logCacheInvalidationError(
	serviceName: ServiceId,
	err: unknown
): void {
	logger.warn("WebSocket cache invalidation failed", {
		serviceName,
		error: normalizeError(err),
	});
}

function onCacheInvalidateMessage(
	message: WsMessage,
	serviceCache: IServiceCache
): void {
	if (message.type !== DiscoveryWsMessageType.CacheInvalidate) {
		return;
	}
	const rawServiceName = message.payload?.serviceName as string | undefined;
	if (!rawServiceName) {
		return;
	}
	const serviceName = toServiceId(rawServiceName);
	serviceCache.delete(serviceName).catch((err: unknown) => {
		_logCacheInvalidationError(serviceName, err);
	});
}

const wsAuthFailureHandler = new WsAuthFailureHandler();

function onWsAuthFailure(deps: ServiceClientDeps): void {
	wsAuthFailureHandler.handle(deps);
}

function createWsClient(ctx: WsClientContext): WebSocketClient {
	const { config, addressManagerClient, tokenManager, serviceCache } = ctx;
	const deps: ServiceClientDeps = { addressManagerClient, tokenManager };
	let wsClient: WebSocketClient;

	wsClient = new WebSocketClient({
		url: URLString.of(config.wsUrl!),
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
