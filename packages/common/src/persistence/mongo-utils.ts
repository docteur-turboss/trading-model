export interface MongoPoolOptions {
	maxPoolSize: number;
	minPoolSize: number;
	serverSelectionTimeoutMS: number;
	connectTimeoutMS: number;
	retryWrites: boolean;
	retryReads: boolean;
}

export const DEFAULT_MONGO_POOL_OPTIONS: MongoPoolOptions = {
	maxPoolSize: 50,
	minPoolSize: 2,
	serverSelectionTimeoutMS: 5000,
	connectTimeoutMS: 5000,
	retryWrites: true,
	retryReads: true,
};

export function resolvePoolSize(poolSizeParam?: number): number {
	return poolSizeParam ?? Number.parseInt(process.env.MONGO_POOL_SIZE ?? "50", 10);
}

export function createPoolOptions(poolSize: number): MongoPoolOptions {
	return {
		...DEFAULT_MONGO_POOL_OPTIONS,
		maxPoolSize: poolSize,
		minPoolSize: Math.max(2, Math.floor(poolSize / 5)),
	};
}
