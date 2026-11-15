import { DlqEvent } from "@trading-model/contracts/dlq-events";
import { z } from "zod";

const ACTOR = z.string().nullable();

/** Validators of the DLQ event payloads, by event type. */
export const DLQ_EVENT_VALIDATORS = {
	[DlqEvent.EntryAdded]: z.object({
		entryId: z.string(),
		topic: z.string().nullable(),
		reason: z.string().nullable(),
		actor: ACTOR,
	}),
	[DlqEvent.ReplayCompleted]: z.object({
		batchId: z.string(),
		topic: z.string().nullable(),
		replayed: z.number().int(),
		failed: z.number().int(),
		actor: ACTOR,
	}),
	[DlqEvent.EntriesDeleted]: z.object({
		ids: z.array(z.string()),
		deleted: z.number().int(),
		actor: ACTOR,
	}),
};
