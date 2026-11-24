import { normalizeError } from "./errors";

/** Runs a CLI `main`, exits with its code, logs a failure via `normalizeError`. */
export function runCli(main: () => Promise<number>): void {
	main().then(
		(code) => process.exit(code),
		(err: unknown) => {
			console.error(normalizeError(err).message);
			process.exit(1);
		}
	);
}
