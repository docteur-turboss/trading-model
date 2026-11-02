import { z } from "zod";

export const HEARTBEAT_SCHEMA = z.object({
	serviceName: z.string().min(1, "serviceName is required"),
	instanceId: z.string().min(1, "instanceId is required"),
});

export const ROTATE_TOKEN_SCHEMA = z.object({
	instanceId: z.string().min(1, "instanceId is required"),
});
