import { WebSocket } from "ws";

export function isWsConnected(ws: WebSocket | null | undefined): ws is WebSocket {
	return ws !== null && ws !== undefined && ws.readyState === WebSocket.OPEN;
}

export function requireWsConnected(ws: WebSocket | null | undefined): asserts ws is WebSocket {
	if (!isWsConnected(ws)) {
		throw new Error("WebSocket is not connected");
	}
}
