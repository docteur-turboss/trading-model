import { z } from "zod";

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

export const REGISTER_SCHEMA = z.object({
	serviceName: z.string().min(1, "serviceName is required"),
	instanceId: z.string().min(1).optional(),
	ip: z.string().regex(IPV4_REGEX, "Invalid IP address"),
	port: z.number().int().min(1).max(65535, "Invalid port"),
	version: z.string().optional(),
});

export function parseRegisterBody(
	req: import("express").Request
): z.infer<typeof REGISTER_SCHEMA> | null {
	const parsed = REGISTER_SCHEMA.safeParse(req.body);
	return parsed.success ? parsed.data : null;
}
