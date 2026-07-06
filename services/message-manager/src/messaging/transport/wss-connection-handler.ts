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
		const topics = _parseTopicsHeader(req.headers["x-subscribed-topics"] as string);
		return { serviceName, instanceId, topics };
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
