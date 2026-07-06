import type { IncomingMessage } from "node:http";
import type { Server as HttpsServer } from "node:https";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { toServiceId } from "@trading-model/common/domain/primitives";
import WebSocket, { WebSocketServer } from "ws";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { WssSubscriptionManager } from "./wss-subscription-manager";
import { WssRateLimiter } from "./wss-rate-limiter";

const WSS_SHUTDOWN_TIMEOUT_MS = 5_000;

interface CloseHandlerContext {
	ws: WebSocket;
	subKey: string;
	identity: ServiceIdentity;
}

export class WssConnectionHandler {
	private _wss!: WebSocketServer;

	constructor(
		private readonly _subscriptionManager: WssSubscriptionManager,
		private readonly _rateLimiter: WssRateLimiter
	) {}

	attach(server: HttpsServer, onConnection: (ws: WebSocket, req: IncomingMessage) => void): void {
		this._rateLimiter.ensureCleanupTimer();
		this._wss = this._createWss(server);
		this._wss.on("connection", (ws, req) => onConnection(ws, req));
		logger.info("WSS transport attached at /ws");
	}

	private _createWss(server: HttpsServer): WebSocketServer {
		return new WebSocketServer({
			server,
			path: "/ws",
			maxPayload: ENV.MAX_PAYLOAD_BYTES,
			verifyClient: this._verifyClient,
		});
	}

	private _verifyClient(
		info: { req: IncomingMessage },
		cb: (result: boolean, code?: number, message?: string) => void
	): void {
		const serviceName = info.req.headers[HTTP_HEADERS.X_SERVICE_NAME] as string;
		const instanceId = info.req.headers[HTTP_HEADERS.X_INSTANCE_ID] as string;
		if (!(serviceName && instanceId)) {
			cb(false, 400, "Missing x-service-name or x-instance-id headers");
			return;
		}
		cb(true);
	}

	parseConnectionHeaders(req: IncomingMessage): {
		identity: ServiceIdentity;
		topics: Set<string>;
	} {
		const serviceName = req.headers[HTTP_HEADERS.X_SERVICE_NAME] as string;
		const instanceId = req.headers[HTTP_HEADERS.X_INSTANCE_ID] as string;
		const topics = _parseTopicsHeader(req.headers[HTTP_HEADERS.X_SUBSCRIBED_TOPICS] as string);
		return { identity: { serviceName: toServiceId(serviceName), instanceId }, topics };
	}

	registerCloseHandler(ws: WebSocket, subKey: string, identity: ServiceIdentity): void {
		ws.on("close", () => {
			this._subscriptionManager.remove(subKey);
			ws.removeAllListeners();
			logger.info("WSS client disconnected", { context: { serviceName: identity.serviceName, instanceId: identity.instanceId } });
		});
	}

	registerErrorHandler(ws: WebSocket, identity: ServiceIdentity): void {
		ws.on("error", (err) => {
			logger.warn("WSS connection error", { context: {
				error: err.message,
				serviceName: identity.serviceName,
				instanceId: identity.instanceId,
			} });
			ws.close(1011, "Internal server error");
		});
	}

	async shutdown(): Promise<void> {
		if (!this._wss) {
			return;
		}
		this._closeAllConnections();
		await this._closeServer();
	}

	private _closeAllConnections(): void {
		for (const [, sub] of this._subscriptionManager.entries()) {
			sub.ws.close(1001, "Server shutdown");
		}
		this._subscriptionManager.clear();
	}

	private async _closeServer(): Promise<void> {
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				this._wss = null;
				resolve();
			}, WSS_SHUTDOWN_TIMEOUT_MS);
			this._wss!.close(() => {
				clearTimeout(timer);
				this._wss = null;
				resolve();
			});
		});
	}

	get wss(): WebSocketServer | null {
		return this._wss;
	}
}

function _parseTopicsHeader(header: string | undefined): Set<string> {
	if (!header) {
		return new Set();
	}
	return new Set(
		header
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean)
	);
}
