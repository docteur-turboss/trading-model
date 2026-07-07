import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type WebSocket from "ws";
import { logger } from "../../config/logger";
import type { WssSubscriptionManager } from "./wss-subscription-manager";

export class ConnectionEventHandler {
	constructor(
		private readonly _subscriptionManager: WssSubscriptionManager
	) {}

	registerCloseHandler(
		ws: WebSocket,
		subKey: string,
		identity: ServiceIdentity
	): void {
		ws.on("close", () => {
			this._subscriptionManager.remove(subKey);
			ws.removeAllListeners();
			logger.info("WSS client disconnected", {
				context: {
					serviceName: identity.serviceName,
					instanceId: identity.instanceId,
				},
			});
		});
	}

	registerErrorHandler(ws: WebSocket, identity: ServiceIdentity): void {
		ws.on("error", (err) => {
			logger.warn("WSS connection error", {
				context: {
					error: err.message,
					serviceName: identity.serviceName,
					instanceId: identity.instanceId,
				},
			});
			ws.close(1011, "Internal server error");
		});
	}
}
