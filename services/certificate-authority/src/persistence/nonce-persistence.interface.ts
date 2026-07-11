import type { ServiceId } from "@trading-model/common/domain/primitives";

export interface NonceContext {
	nonce: string;
	serviceId: ServiceId;
}

export interface NonceDocument {
	nonce: string;
	serviceId: ServiceId;
	createdAt: Date;
}

export interface NoncePersistence {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	persist(context: NonceContext, createdAt: number): Promise<void>;
	consume(context: NonceContext): Promise<NonceDocument | null>;
	loadAll(threshold: Date): Promise<NonceDocument[]>;
}
