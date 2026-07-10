import type { InstanceId } from "@trading-model/common/domain/primitives";

export interface LockContext {
	lockName: string;
	instanceId: InstanceId;
}

export interface LockDocument {
	name: string;
	acquiredAt: Date;
	expiresAt: Date;
	instanceId: InstanceId;
	fencingToken: number;
}

export interface LockBackend {
	acquire(context: LockContext, ttlMs: number): Promise<number | null>;
	release(context: LockContext, fencingToken: number): Promise<boolean>;
	verifyOwnership(context: LockContext, fencingToken: number): Promise<number>;
	disconnect?(): void;
}
