export enum RedisStatus {
	READY = "ready",
	CONNECTING = "connecting",
	RECONNECTING = "reconnecting",
	CLOSE = "close",
}
/** @deprecated Use {@link RedisStatus} enum directly */
export const REDIS_STATUS = RedisStatus;

export enum RedisResp {
	OK = "OK",
	PONG = "PONG",
}
/** @deprecated Use {@link RedisResp} enum directly */
export const REDIS_RESP = RedisResp;

export enum RedisSet {
	NX = "NX",
	XX = "XX",
	EX = "EX",
	PX = "PX",
}
/** @deprecated Use {@link RedisSet} enum directly */
export const REDIS_SET = RedisSet;

export enum RedisMode {
	SINGLE = "single",
	SENTINEL = "sentinel",
	CLUSTER = "cluster",
}
