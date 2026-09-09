import type https from "node:https";
import type WebSocket from "ws";
import type { WebSocketServer } from "ws";
import type {
	ClientConnectionManager,
	ConnectedClient,
} from "../adapters/inbound/client-connection-manager";

export class WsConnectionSetup {
	constructor(
		private readonly _clientManager: ClientConnectionManager,
		private readonly _onMessage: (
			clientId: string,
			client: ConnectedClient,
			data: WebSocket.Data
		) => void,
		private readonly _onClose: (clientId: string) => void,
		private readonly _onError: (clientId: string, error: unknown) => void
	) {}

	setupUpgradeHandler(
		rawServer: https.Server,
		wss: WebSocketServer,
		path: string
	): void {
		rawServer.on("upgrade", (request, socket, head) => {
			if (request.url?.startsWith(path)) {
				wss.handleUpgrade(request, socket, head, (ws, req) => {
					wss.emit("connection", ws, req);
				});
			}
		});
	}

	setupConnectionHandler(wss: WebSocketServer): void {
		wss.on("connection", (ws: WebSocket, req) => {
			const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
			const client: ConnectedClient = {
				ws,
				subscribedServices: new Set(),
			};
			this._clientManager.add(clientId, client);

			ws.on("message", (data) => this._onMessage(clientId, client, data));
			ws.on("close", () => this._onClose(clientId));
			ws.on("error", (error) => this._onError(clientId, error));
		});
	}
}
