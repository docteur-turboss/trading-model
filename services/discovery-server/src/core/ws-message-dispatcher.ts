import { logger } from "@trading-model/common/config/logger";
import type {
	DiscoveryWsClientMessage,
	DiscoveryWsHeartbeatMessage,
	DiscoveryWsSubscribeMessage,
} from "@trading-model/common/contracts/discovery-ws-message.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import WebSocket from "ws";
import type { ConnectedClient } from "./client-connection-manager";

export class WsMessageDispatcher {
	private readonly _messageHandlers: Record<
		string,
		(
			clientId: string,
			client: ConnectedClient,
			message: DiscoveryWsClientMessage,
		) => void
	> = {
		subscribe: (clientId, client, message) =>
			this._handleSubscribe(clientId, client, message as never),
		heartbeat: (_clientId, client, message) =>
			this._handleHeartbeat(client, message as never),
	};

	handleMessage(
		clientId: string,
		client: ConnectedClient,
		data: WebSocket.Data,
	): void {
		try {
			const parsed = JSON.parse(data.toString()) as {
				type: string;
				payload?: Record<string, unknown>;
			};
			this._dispatch(clientId, client, parsed as DiscoveryWsClientMessage);
		} catch (error) {
			logger.warn("Failed to parse WS message", {
				clientId,
				err: normalizeError(error),
			});
		}
	}

	private _dispatch(
		clientId: string,
		client: ConnectedClient,
		message: DiscoveryWsClientMessage,
	): void {
		const handler = this._messageHandlers[message.type];
		if (handler) {
			handler(clientId, client, message);
		} else {
			logger.debug("Unknown WS message type", {
				clientId,
				type: (message as { type: string }).type,
			});
		}
	}

	private _handleSubscribe(
		clientId: string,
		client: ConnectedClient,
		message: DiscoveryWsSubscribeMessage,
	): void {
		const services = message.payload?.services;
		if (Array.isArray(services)) {
			for (const svc of services) {
				client.subscribedServices.add(String(svc));
			}
		} else {
			client.subscribedServices.add("*");
		}
		logger.info("Discovery WS client subscribed", {
			clientId,
			services: [...client.subscribedServices],
		});
	}

	private _handleHeartbeat(
		client: ConnectedClient,
		message: DiscoveryWsHeartbeatMessage,
	): void {
		if (message.payload?.serviceName) {
			client.serviceName = message.payload.serviceName;
		}
		if (message.payload?.instanceId) {
			client.instanceId = message.payload.instanceId;
		}
	}
}
