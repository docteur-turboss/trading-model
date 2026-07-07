import { z } from "zod";

const LOG_ENTRY_SCHEMA = z.object({
	level: z.enum(["debug", "info", "warn", "error"]),
	message: z.string(),
	context: z.record(z.string(), z.unknown()).optional(),
	serviceName: z.string().optional(),
	instanceId: z.string().optional(),
	module: z.string().optional(),
	correlationId: z.string().optional(),
	environment: z.string().optional(),
	userId: z.string().nullable().optional(),
	sessionId: z.string().nullable().optional(),
	error: z
		.object({
			name: z.string().optional(),
			message: z.string().optional(),
			stack: z.string().optional(),
			code: z.string().optional(),
		})
		.optional(),
	request: z
		.object({
			method: z.string().optional(),
			url: z.string().optional(),
			statusCode: z.number().optional(),
			durationMs: z.number().optional(),
		})
		.optional(),
	timestamp: z.string().optional(),
});

const LOGS_BATCH_SCHEMA = z.object({
	logs: z.array(LOG_ENTRY_SCHEMA).min(1).max(1000),
});

export { LOG_ENTRY_SCHEMA, LOGS_BATCH_SCHEMA };
