export const REDIS_STATUS = {
	READY: "ready",
	CONNECTING: "connecting",
	RECONNECTING: "reconnecting",
	CLOSE: "close",
} as const;

export type RedisStatus = (typeof REDIS_STATUS)[keyof typeof REDIS_STATUS];

export const REDIS_RESP = {
	OK: "OK",
	PONG: "PONG",
} as const;

export const REDIS_SET = {
	NX: "NX",
	XX: "XX",
	EX: "EX",
	PX: "PX",
} as const;

export const REDIS_MODE = {
	SINGLE: "single",
	SENTINEL: "sentinel",
	CLUSTER: "cluster",
} as const;

export type RedisMode = (typeof REDIS_MODE)[keyof typeof REDIS_MODE];
