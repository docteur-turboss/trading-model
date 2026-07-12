import {
	DurationMs,
	InstanceId,
	PositiveInt,
	ServiceId,
	URLString,
	type Version,
} from "../domain/primitives";

export interface ErrorTrackingConfig {
	endpoint?: URLString;
	serviceName?: ServiceId;
	serviceVersion?: Version;
	instanceId?: InstanceId;
	flushIntervalMs?: DurationMs;
	batchSize?: PositiveInt;
}

export type ResolvedErrorTrackingConfig = Required<ErrorTrackingConfig>;

export const DEFAULT_CONFIG: ResolvedErrorTrackingConfig = {
	endpoint: URLString.of(""),
	serviceName: ServiceId.of("unknown"),
	serviceVersion: "0.0.0" as Version,
	instanceId: InstanceId.of("unknown"),
	flushIntervalMs: DurationMs.of(5000),
	batchSize: PositiveInt.of(50),
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
		flushIntervalMs: opts.flushIntervalMs ?? DurationMs.of(5000),
		batchSize: opts.batchSize ?? PositiveInt.of(50),
	};
}
