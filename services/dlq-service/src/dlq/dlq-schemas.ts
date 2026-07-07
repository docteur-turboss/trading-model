import { z } from "zod";

export const DlqEntrySchema = z.object({
	topic: z.string().optional(),
	message: z.unknown(),
	reason: z.string().optional(),
	deliveryAttempt: z.number().int(),
	timestamp: z.string(),
	messageId: z.string().optional(),
});

export const DeleteSchema = z.object({
	ids: z.array(z.string()).min(1).max(1000),
});
