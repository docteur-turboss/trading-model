import type { Topic, InstanceId } from "@trading-model/common/domain/primitives";

export class RedisSubscriptionKeys {
	constructor(private readonly _prefix: string) {}

	topicKey(topic: Topic): string {
		return `${this._prefix}sub:${topic}`;
	}

	instanceKey(instanceId: InstanceId): string {
		return `${this._prefix}instance:${instanceId}`;
	}

	subKey(sub: import("./messaging-types").TopicSubscription): string {
		return `${this.topicKey(sub.topic)}:${sub.instanceId}`;
	}

	topicsSetKey(): string {
		return `${this._prefix}topics`;
	}

	activeInstancesKey(): string {
		return `${this._prefix}active-instances`;
	}

	leaseKey(instanceId: InstanceId): string {
		return `${this._prefix}lease:${instanceId}`;
	}
}
