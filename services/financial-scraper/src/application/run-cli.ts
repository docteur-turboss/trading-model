import { normalizeError } from "@trading-model/common/utils/errors";

/** Runs a CLI `main`, exits with its code, logs a failure via `normalizeError`. */
export function runCli(main: () => Promise<number>): void {
	main().then(
		(code) => process.exit(code),
		(err: unknown) => {
			console.error(normalizeError(err).message ?? err);
			process.exit(1);
		}
	);
}
