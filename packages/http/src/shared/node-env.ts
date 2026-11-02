export const NODE_ENVS = [
	"development",
	"test",
	"staging",
	"production",
] as const;

export type NodeEnv = string & { readonly brand: "NodeEnv" };

export const NODE_ENV = {
	DEVELOPMENT: "development" as NodeEnv,
	TEST: "test" as NodeEnv,
	STAGING: "staging" as NodeEnv,
	PRODUCTION: "production" as NodeEnv,
} as const;

export function getNodeEnv(): NodeEnv {
	return (process.env.NODE_ENV as NodeEnv) ?? NODE_ENV.DEVELOPMENT;
}

export function isProduction(): boolean {
	return getNodeEnv() === NODE_ENV.PRODUCTION;
}

export function isStaging(): boolean {
	return getNodeEnv() === NODE_ENV.STAGING;
}

export function isDevelopment(): boolean {
	return getNodeEnv() === NODE_ENV.DEVELOPMENT;
}
