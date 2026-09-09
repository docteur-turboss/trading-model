import type { DurationMs } from "../domain/primitives";

export function createWsConnectTimeout(
	onTimeout: () => void,
	timeoutMs?: DurationMs
): () => void {
	const timer = setTimeout(onTimeout, timeoutMs ?? 10_000);
	timer.unref();
	return () => {
		clearTimeout(timer);
	};
}
