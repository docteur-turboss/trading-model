export class RedisKeyBuilder {
	constructor(private readonly _prefix: string) {}

	serviceInstancesSet(serviceName: string): string {
		return `${this._prefix}service:${serviceName}:instances`;
	}

	instanceMetadata(instanceId: string): string {
		return `${this._prefix}instance:${instanceId}:metadata`;
	}

	instanceToken(instanceId: string): string {
		return `${this._prefix}instance:${instanceId}:token`;
	}

	instanceUpdatedBy(instanceId: string): string {
		return `${this._prefix}instance:${instanceId}:updatedBy`;
	}

	servicePattern(): string {
		return `${this._prefix}service:*:instances`;
	}

	parseServiceName(key: string): string | null {
		const match = key.match(
			new RegExp(`^${this._prefix}service:(.+):instances$`),
		);
		return match ? match[1] : null;
	}
}
