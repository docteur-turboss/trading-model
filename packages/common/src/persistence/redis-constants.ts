export type RedisStatus = string & { readonly brand: "RedisStatus" };

export const REDIS_STATUS = {
	READY: "ready" as RedisStatus,
	CONNECTING: "connecting" as RedisStatus,
	RECONNECTING: "reconnecting" as RedisStatus,
	CLOSE: "close" as RedisStatus,
} as const;

export type RedisResp = string & { readonly brand: "RedisResp" };

export const REDIS_RESP = {
	OK: "OK" as RedisResp,
	PONG: "PONG" as RedisResp,
} as const;

export type RedisSet = string & { readonly brand: "RedisSet" };

export const REDIS_SET = {
	NX: "NX" as RedisSet,
	XX: "XX" as RedisSet,
	EX: "EX" as RedisSet,
	PX: "PX" as RedisSet,
} as const;

export enum RedisMode {
	SINGLE = "single",
	SENTINEL = "sentinel",
	CLUSTER = "cluster",
}
