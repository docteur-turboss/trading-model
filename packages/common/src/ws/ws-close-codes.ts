/**
 * Non-standard WebSocket close codes shared across services.
 * Standard codes (1000-1015) follow the RFC 6455 spec and are used inline.
 */
export const WS_CLOSE_CODES = {
	/**
	 * Sent by a peer when a client exceeds the max auth attempts and
	 * interpreted by clients (e.g. address-manager) as an auth failure.
	 */
	AUTH_FAILURE: 4001,
} as const;
