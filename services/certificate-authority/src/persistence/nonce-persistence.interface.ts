export interface NonceContext {
	nonce: string;
	serviceId: string;
}

export interface NonceDocument {
	nonce: string;
	serviceId: string;
	createdAt: Date;
}

export interface NoncePersistence {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	persist(context: NonceContext, createdAt: number): Promise<void>;
	consume(context: NonceContext): Promise<NonceDocument | null>;
	loadAll(threshold: Date): Promise<NonceDocument[]>;
}
