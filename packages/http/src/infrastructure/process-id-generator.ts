import { ProcessId } from "@trading-model/primitives/primitives";
import type { LogLevel } from "./log-types";

export function generateProcessId(logLevel: LogLevel): ProcessId {
	const now = new Date();
	return ProcessId.of(
		`${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}-${logLevel}_${(crypto.getRandomValues(new Uint32Array(10))[0] * 2 ** -32).toString(36).substring(2, 10)}`
	);
}
