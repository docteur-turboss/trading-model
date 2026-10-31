import type { DlqEntry } from "@trading-model/contracts/dlq-types";
import { brand } from "@trading-model/http/adapters/inbound/api-route/api-route";
import {
	PositiveInt,
	toMessageId,
	toTopic,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { z } from "zod";
import type { AcceptsContract, Assert, YieldsContract } from "./contract-shape";

const EPOCH_MS = z.number().int().nonnegative();

/**
 * dlq-service used to take any string as `timestamp` while the contract (and
 * message-manager) use epoch milliseconds. Epoch-millisecond strings and ISO
 * dates stay accepted until every producer sends a number (ADR-0021).
 */
const LEGACY_TIMESTAMP = z.union([
	z.string().regex(/^\d+$/).transform(Number).pipe(EPOCH_MS),
	z.iso
		.datetime({ offset: true })
		.transform((value) => Date.parse(value))
		.pipe(EPOCH_MS),
]);

/**
 * A dead-lettered message as it travels to dlq-service (`POST /dlq`). Parsing
 * yields the `DlqEntry` contract, brands included. The server assigns `id`.
 */
export const DlqEntryWire = z.object({
	topic: z.string().min(1).transform(brand(toTopic)).optional(),
	message: z.unknown(),
	reason: z.string().optional(),
	deliveryAttempt: z.number().int().min(1).transform(brand(PositiveInt.of)),
	timestamp: z
		.union([EPOCH_MS, LEGACY_TIMESTAMP])
		.transform(brand(UnixTimestamp.of)),
	messageId: z.string().min(1).transform(brand(toMessageId)).optional(),
});

export type DlqEntryWireChecks = [
	Assert<AcceptsContract<typeof DlqEntryWire, DlqEntry>>,
	Assert<YieldsContract<typeof DlqEntryWire, DlqEntry>>,
];
