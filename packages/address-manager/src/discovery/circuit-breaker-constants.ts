import {
	DurationMs,
	PositiveInt,
} from "@trading-model/common/domain/primitives";

export const DEFAULT_LATENCY_WINDOW_SIZE = PositiveInt.of(100);
export const DEFAULT_LATENCY_P99_THRESHOLD_MS = DurationMs.of(5000);
export const DEFAULT_LOAD_CACHE_TTL_MS = DurationMs.of(2_000);
