/** Accepted NODE_ENV values. */
export const NODE_ENVS = [
	"development",
	"test",
	"staging",
	"production",
] as const;

/** NODE_ENV value, branded so a plain string is not mistaken for one. */
export type NodeEnv = string & { readonly brand: "NodeEnv" };

/** Well-known NODE_ENV values. */
export const NODE_ENV = {
	DEVELOPMENT: "development" as NodeEnv,
	TEST: "test" as NodeEnv,
	STAGING: "staging" as NodeEnv,
	PRODUCTION: "production" as NodeEnv,
} as const;

/** Reads NODE_ENV, defaulting to development. */
export function getNodeEnv(): NodeEnv {
	return (process.env.NODE_ENV as NodeEnv) ?? NODE_ENV.DEVELOPMENT;
}
