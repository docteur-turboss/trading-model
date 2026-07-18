import type {
	InstanceId,
	Topic,
} from "@trading-model/common/domain/primitives";
import type { RedisKeyBuilder } from "./redis-key-builder";

export class RedisSubscriptionKeys {
	constructor(private readonly _keys: RedisKeyBuilder) {}

	topicKey(topic: Topic): string {
		return this._keys.key("sub", topic);
	}

	instanceKey(instanceId: InstanceId): string {
		return this._keys.key("instance", instanceId);
	}

	subKey(
		sub: import("../../messaging/core/messaging-types").TopicSubscription
	): string {
		return `${this.topicKey(sub.topic)}:${sub.instanceId}`;
	}

	topicsSetKey(): string {
		return this._keys.key("topics");
	}

	activeInstancesKey(): string {
		return this._keys.key("active-instances");
	}

	leaseKey(instanceId: InstanceId): string {
		return this._keys.key("lease", instanceId);
	}
}
