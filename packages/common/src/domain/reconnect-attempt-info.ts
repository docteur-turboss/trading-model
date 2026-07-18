import type { DurationMs } from "./primitives";

export interface ReconnectAttemptInfo {
	attempt: number;
	delay: DurationMs;
}
