import type { IncomingMessage } from "node:http";
import type { Server as HttpsServer } from "node:https";
import WebSocket, { WebSocketServer } from "ws";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { WssSubscriptionManager } from "./wss-subscription-manager";
import { WssRateLimiter } from "./wss-rate-limiter";

const WSS_SHUTDOWN_TIMEOUT_MS = 5_000;

interface CloseHandlerContext {
	ws: WebSocket;
	subKey: string;
	serviceName: string;
	instanceId: string;
}

export class WssConnectionHandler {
	private _wss: WebSocketServer | null = null;

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
		const serviceName = info.req.headers["x-service-name"] as string;
		const instanceId = info.req.headers["x-instance-id"] as string;
		if (!(serviceName && instanceId)) {
			cb(false, 400, "Missing x-service-name or x-instance-id headers");
			return;
		}
		cb(true);
	}

	parseConnectionHeaders(req: IncomingMessage): {
		serviceName: string;
		instanceId: string;
		topics: Set<string>;
	} {
		const serviceName = req.headers["x-service-name"] as string;
		const instanceId = req.headers["x-instance-id"] as string;
		const topicsHeader = req.headers["x-subscribed-topics"] as string;
		const topics = new Set(
			topicsHeader
				? topicsHeader
						.split(",")
						.map((part) => part.trim())
						.filter(Boolean)
				: []
		);
		return { serviceName, instanceId, topics };
	}

	registerCloseHandler(ws: WebSocket, subKey: string, serviceName: string, instanceId: string): void {
		ws.on("close", () => {
			this._subscriptionManager.remove(subKey);
			ws.removeAllListeners();
			logger.info("WSS client disconnected", { context: { serviceName, instanceId } });
		});
	}

	registerErrorHandler(ws: WebSocket, serviceName: string, instanceId: string): void {
		ws.on("error", (err) => {
			logger.warn("WSS connection error", { context: {
				error: err.message,
				serviceName,
				instanceId,
			} });
			ws.close(1011, "Internal server error");
		});
	}

	async shutdown(): Promise<void> {
		if (this._wss) {
			for (const [, sub] of this._subscriptionManager.entries()) {
				sub.ws.close(1001, "Server shutdown");
			}
			this._subscriptionManager.clear();
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
	}

	get wss(): WebSocketServer | null {
		return this._wss;
	}
}
