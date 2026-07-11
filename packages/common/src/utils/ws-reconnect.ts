import type { DurationMs } from "../domain/primitives";
import {
	type BackoffConfig,
	computeExponentialBackoffWithJitter,
} from "./backoff-config";

export interface WsReconnectConfig extends BackoffConfig {
	maxAttempts?: number;
	jitterMs?: number;
}

export interface WsReconnectState {
	attempt: number;
	timer: ReturnType<typeof setTimeout> | null;
	destroyed: boolean;
}

function calculateDelay(config: WsReconnectConfig, attempt: number): number {
	return computeExponentialBackoffWithJitter(attempt, {
		baseDelayMs: config.baseDelayMs ?? 1000,
		maxDelayMs: config.maxDelayMs ?? 60000,
		jitterMs: config.jitterMs ?? 500,
	});
}

export interface WsReconnectOptions {
	state: WsReconnectState;
	config: WsReconnectConfig;
	onReconnect: () => void;
	onSchedule?: (info: { attempt: number; delay: number }) => void;
	logger: {
		info: (msg: string, context?: Record<string, unknown>) => void;
		warn: (msg: string, context?: Record<string, unknown>) => void;
	};
}

function _checkMaxAttempts(options: WsReconnectOptions): boolean {
	const { state, config, logger } = options;
	const maxAttempts = config.maxAttempts;
	if (maxAttempts !== undefined && state.attempt >= maxAttempts) {
		logger.warn("WebSocket max reconnect attempts reached", {
			context: { attempts: state.attempt },
		});
		return true;
	}
	return false;
}

function _cancelExistingTimer(state: WsReconnectState): void {
	if (state.timer) {
		clearTimeout(state.timer);
		state.timer = null;
	}
}

function _scheduleWithDelay(options: WsReconnectOptions): void {
	const { state, config, onReconnect, onSchedule, logger } = options;
	state.attempt++;
	const delay = calculateDelay(config, state.attempt);
	onSchedule?.({ attempt: state.attempt, delay });
	logger.info(
		`WebSocket reconnecting in ${Math.round(delay)}ms (attempt ${state.attempt})`
	);
	state.timer = setTimeout(() => {
		state.timer = null;
		onReconnect();
	}, delay);
	state.timer.unref();
}

export function scheduleWsReconnect(options: WsReconnectOptions): void {
	const { state } = options;
	if (state.destroyed) {
		return;
	}
	if (_checkMaxAttempts(options)) {
		return;
	}
	_cancelExistingTimer(state);
	_scheduleWithDelay(options);
}

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
