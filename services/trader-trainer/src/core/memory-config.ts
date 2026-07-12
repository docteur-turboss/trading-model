import type { EvictionPolicy } from "./eviction-policy";

export interface MemoryConfig {
	maxSize: number;
	maxMemoryBytes: number;
	evictionPolicy: EvictionPolicy;
}
