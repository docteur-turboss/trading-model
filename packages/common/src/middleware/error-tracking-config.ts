import type { InstanceId, ServiceId, URLString, Version } from "../domain/primitives";

const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 50;

export interface ErrorTrackingConfig {
	endpoint?: URLString;
	serviceName?: ServiceId;
	serviceVersion?: Version;
	instanceId?: InstanceId;
	flushIntervalMs?: number;
	batchSize?: number;
}

export type ResolvedErrorTrackingConfig = Required<ErrorTrackingConfig>;

export const DEFAULT_CONFIG: ResolvedErrorTrackingConfig = {
	endpoint: "" as URLString,
	serviceName: "unknown" as ServiceId,
	serviceVersion: "0.0.0" as Version,
	instanceId: "unknown" as InstanceId,
	flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
	batchSize: DEFAULT_BATCH_SIZE,
};

export function buildConfig(
	opts: ErrorTrackingConfig
): ResolvedErrorTrackingConfig {
	return {
		endpoint: (opts.endpoint ?? process.env.ERROR_URL_WEBHOOK ?? "") as URLString,
		serviceName: (opts.serviceName ?? process.env.APP_NAME ?? "unknown") as ServiceId,
		serviceVersion:
			opts.serviceVersion ?? ((process.env.APP_VERSION ?? "0.0.0") as Version),
		instanceId:
			opts.instanceId ?? ((process.env.INSTANCE_ID ?? "unknown") as InstanceId),
		flushIntervalMs: opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
		batchSize: opts.batchSize ?? DEFAULT_BATCH_SIZE,
	};
}
