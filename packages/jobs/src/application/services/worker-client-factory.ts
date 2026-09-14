import type { WorkerWsHeartbeatMessage } from "@trading-model/common/contracts/worker-protocol-types";
import {
	DurationMs,
	toInstanceId,
	URLString,
} from "@trading-model/common/domain/primitives";
import { DefaultWsReconnector } from "@trading-model/common/ws/default-ws-reconnector";
import { WorkerWsConnection } from "../../adapters/outbound/worker-ws-connection";
import type { WorkerClientConfig } from "./worker-client";
import { WorkerHeartbeat } from "./worker-heartbeat";

export type NormalizedConfig = Required<
	Omit<WorkerClientConfig, "reconnectConfig">
> & {
	reconnectBaseDelayMs: DurationMs;
	reconnectMaxDelayMs: DurationMs;
};

export function normalizeConfig(config: WorkerClientConfig): NormalizedConfig {
	const reconnect = config.reconnectConfig ?? {};
	return {
		workerId: config.workerId,
		serverUrl: config.serverUrl,
		capabilities: config.capabilities,
		maxConcurrency: config.maxConcurrency,
		heartbeatIntervalMs: config.heartbeatIntervalMs ?? DurationMs.of(15000),
		reconnectBaseDelayMs: reconnect.baseDelayMs ?? DurationMs.of(1000),
		reconnectMaxDelayMs: reconnect.maxDelayMs ?? DurationMs.of(30000),
	};
}

export function buildConnection(cfg: NormalizedConfig): WorkerWsConnection {
	return new WorkerWsConnection({
		workerId: toInstanceId(cfg.workerId),
		serverUrl: URLString.of(cfg.serverUrl),
		capabilities: cfg.capabilities,
		maxConcurrency: cfg.maxConcurrency,
	});
}

export function buildReconnector(
	cfg: NormalizedConfig,
	onReconnect: () => Promise<void>,
	onSchedule: (info: { attempt: number; delay: number }) => void
): DefaultWsReconnector {
	return new DefaultWsReconnector({
		config: {
			baseDelayMs: cfg.reconnectBaseDelayMs,
			maxDelayMs: cfg.reconnectMaxDelayMs,
		},
		onReconnect,
		onSchedule,
	});
}

export function buildHeartbeat(
	cfg: NormalizedConfig,
	send: (msg: WorkerWsHeartbeatMessage) => void
): WorkerHeartbeat {
	return new WorkerHeartbeat(
		cfg.workerId,
		(msg: WorkerWsHeartbeatMessage) => send(msg),
		cfg.heartbeatIntervalMs
	);
}
