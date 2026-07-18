import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import {
	type DiscoveryWsClientMessage,
	type DiscoveryWsHeartbeatMessage,
	DiscoveryWsMessageType,
	type DiscoveryWsSubscribeMessage,
} from "@trading-model/validation/contracts/discovery-ws-message.types";
import type WebSocket from "ws";
import type { ConnectedClient } from "./client-connection-manager";

export class WsMessageDispatcher {
	private readonly _messageHandlers: Partial<
		Record<
			DiscoveryWsMessageType,
			(
				clientId: string,
				client: ConnectedClient,
				message: DiscoveryWsClientMessage
			) => void
		>
	> = {
		[DiscoveryWsMessageType.Subscribe]: (clientId, client, message) => {
			if (message.type === DiscoveryWsMessageType.Subscribe) {
				this._handleSubscribe(clientId, client, message);
			}
		},
		[DiscoveryWsMessageType.Heartbeat]: (_clientId, client, message) => {
			if (message.type === DiscoveryWsMessageType.Heartbeat) {
				this._handleHeartbeat(client, message);
			}
		},
	};

	handleMessage(
		clientId: string,
		client: ConnectedClient,
		data: WebSocket.Data
	): void {
		try {
			const parsed = JSON.parse(data.toString()) as DiscoveryWsClientMessage;
			this._dispatch(clientId, client, parsed);
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
		message: DiscoveryWsClientMessage
	): void {
		const handler = this._messageHandlers[message.type];
		if (handler) {
			handler(clientId, client, message);
		} else {
			logger.debug("Unknown WS message type", {
				clientId,
				type: message.type,
			});
		}
	}

	private _handleSubscribe(
		clientId: string,
		client: ConnectedClient,
		message: DiscoveryWsSubscribeMessage
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
		message: DiscoveryWsHeartbeatMessage
	): void {
		if (message.payload?.serviceName) {
			client.serviceName = message.payload
				.serviceName as unknown as ServiceInstanceName;
		}
		if (message.payload?.instanceId) {
			client.instanceId = message.payload.instanceId;
		}
	}
}
