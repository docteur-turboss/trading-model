import type { z } from "zod";
import type { LOG_ENTRY_SCHEMA } from "./log-schemas";

export function extractError(
	entry: z.infer<typeof LOG_ENTRY_SCHEMA>
):
	| { name: string; message: string; stack?: string; code?: string }
	| undefined {
	const context = entry.context ?? {};

	if (entry.error) {
		return {
			name: entry.error.name ?? "Error",
			message: entry.error.message ?? "Unknown error",
			stack: entry.error.stack,
			code: entry.error.code,
		};
	}

	const ctxErr = context.err as Error | undefined;
	const ctxError = context.error as Error | undefined;
	if (ctxErr || ctxError) {
		return {
			name: ctxErr?.name ?? ctxError?.name ?? "Error",
			message: ctxErr?.message ?? ctxError?.message ?? "Unknown error",
			stack: ctxErr?.stack ?? ctxError?.stack,
		};
	}
}
