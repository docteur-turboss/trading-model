import type { SessionId } from "../domain/primitives";

export function generateSessionId(logLevel: string): SessionId {
	const now = new Date();
	return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}-${logLevel}_${(crypto.getRandomValues(new Uint32Array(10))[0] * 2 ** -32).toString(36).substring(2, 10)}` as SessionId;
}
