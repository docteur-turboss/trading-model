export interface MongoPoolOptions {
	maxPoolSize: number;
	minPoolSize: number;
	serverSelectionTimeoutMS: number;
	connectTimeoutMS: number;
	socketTimeoutMS: number;
	retryWrites: boolean;
	retryReads: boolean;
}

export const DEFAULT_MONGO_POOL_OPTIONS: MongoPoolOptions = {
	maxPoolSize: 50,
	minPoolSize: 2,
	serverSelectionTimeoutMS: 5000,
	connectTimeoutMS: 5000,
	socketTimeoutMS: 30_000,
	retryWrites: true,
	retryReads: true,
};

export function resolvePoolSize(poolSizeParam?: number): number {
	return (
		poolSizeParam ?? Number.parseInt(process.env.MONGO_POOL_SIZE ?? "50", 10)
	);
}

export function createPoolOptions(
	poolSize: number,
	minPoolSize?: number
): MongoPoolOptions {
	return {
		...DEFAULT_MONGO_POOL_OPTIONS,
		maxPoolSize: poolSize,
		minPoolSize: minPoolSize ?? Math.max(2, Math.floor(poolSize / 5)),
	};
}

/**
 * The `auth` option of `MongoConnectionConfig` from `MONGO_USERNAME` /
 * `MONGO_PASSWORD`; both or none, a half-set pair is a misconfiguration.
 */
export function mongoAuthFromEnv(env: {
	MONGO_USERNAME?: string;
	MONGO_PASSWORD?: string;
}): { username: string; password: string } | undefined {
	const { MONGO_USERNAME: username, MONGO_PASSWORD: password } = env;
	if (username === undefined && password === undefined) {
		return undefined;
	}
	if (!(username && password)) {
		throw new Error("MONGO_USERNAME and MONGO_PASSWORD must be set together");
	}
	return { username, password };
}
