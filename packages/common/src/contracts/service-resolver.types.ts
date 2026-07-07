export interface ServiceEndpoint {
	host: string;
	port: number;
	version?: string;
}

export interface ResolveOptions {
	majorVersion?: number;
	region?: string;
	timeoutMs?: number;
}

export interface IServiceResolver {
	resolve(serviceName: string, options?: ResolveOptions): Promise<ServiceEndpoint | null>;
	invalidateCache?(serviceName?: string): void;
}
