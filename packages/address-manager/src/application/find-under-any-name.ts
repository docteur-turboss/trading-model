import { registryNamesFor } from "@trading-model/common/config/workload-identity";

/**
 * Release N of the service-name migration (#495): a client may ask for an old
 * name while the service registered under the canonical one (or the reverse).
 * Tries every registry name of the service in order; throws the first error
 * when none answers. Removed with the legacy aliases in release N+1.
 * shortcut: a miss on the first name costs its discovery retries, drop with N+1.
 */
export async function findUnderAnyName<Result>(
	find: (name: string) => Promise<Result>,
	serviceName: string
): Promise<Result> {
	let firstError: unknown;
	for (const name of registryNamesFor(serviceName)) {
		// biome-ignore lint/plugin: a miss under one alias is expected, the next is tried
		try {
			return await find(name);
		} catch (error) {
			firstError ??= error;
		}
	}
	throw firstError;
}
