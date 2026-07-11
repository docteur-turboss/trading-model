import {
	InstanceId,
	ServiceId,
	URLString,
	type Version,
} from "../domain/primitives";

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
	endpoint: URLString.of(""),
	serviceName: ServiceId.of("unknown"),
	serviceVersion: "0.0.0" as Version,
	instanceId: InstanceId.of("unknown"),
	flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
	batchSize: DEFAULT_BATCH_SIZE,
};

export function buildConfig(
	opts: ErrorTrackingConfig
): ResolvedErrorTrackingConfig {
	return {
		endpoint: URLString.of(
			opts.endpoint ?? process.env.ERROR_URL_WEBHOOK ?? ""
		),
		serviceName: ServiceId.of(
			opts.serviceName ?? process.env.APP_NAME ?? "unknown"
		),
		serviceVersion:
			opts.serviceVersion ?? ((process.env.APP_VERSION ?? "0.0.0") as Version),
		instanceId: InstanceId.of(
			opts.instanceId ?? process.env.INSTANCE_ID ?? "unknown"
		),
		flushIntervalMs: opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
		batchSize: opts.batchSize ?? DEFAULT_BATCH_SIZE,
	};
}
