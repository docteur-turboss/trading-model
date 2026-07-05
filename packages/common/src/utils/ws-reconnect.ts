export interface WsReconnectConfig {
	maxAttempts?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	jitterMs?: number;
}

export interface WsReconnectState {
	attempt: number;
	timer: ReturnType<typeof setTimeout> | null;
	destroyed: boolean;
}

function calculateDelay(config: WsReconnectConfig, attempt: number): number {
	const baseDelayMs = config.baseDelayMs ?? 1000;
	const maxDelayMs = config.maxDelayMs ?? 60000;
	const jitterMs = config.jitterMs ?? 500;
	const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
	const jitter = jitterMs > 0 ? Math.random() * jitterMs : 0;
	return delay + jitter;
}

export function scheduleWsReconnect(
	state: WsReconnectState,
	config: WsReconnectConfig,
	onReconnect: () => void,
	logger: {
		info: (msg: string, context?: Record<string, unknown>) => void;
		warn: (msg: string, context?: Record<string, unknown>) => void;
	}
): void {
	if (state.destroyed) {
		return;
	}

	const maxAttempts = config.maxAttempts;
	if (maxAttempts !== undefined && state.attempt >= maxAttempts) {
		logger.warn("WebSocket max reconnect attempts reached", {
			attempts: state.attempt,
		});
		return;
	}

	if (state.timer) {
		clearTimeout(state.timer);
		state.timer = null;
	}

	state.attempt++;
	const delay = calculateDelay(config, state.attempt);
	logger.info(
		`WebSocket reconnecting in ${Math.round(delay)}ms (attempt ${state.attempt})`
	);
	state.timer = setTimeout(() => {
		state.timer = null;
		onReconnect();
	}, delay);
	state.timer.unref();
}

export function createWsConnectTimeout(
	onTimeout: () => void,
	timeoutMs?: number
): () => void {
	const timer = setTimeout(onTimeout, timeoutMs ?? 10_000);
	return () => {
		clearTimeout(timer);
	};
}
