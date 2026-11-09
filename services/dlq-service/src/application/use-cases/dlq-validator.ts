import type { Bytes } from "@trading-model/primitives/primitives";

const MAX_MESSAGE_BYTES = (5 * 1024 * 1024) as Bytes;

export type EntryRejection = "too-large" | "storage-unavailable";

/**
 * What the route schema cannot check: the 5 MB payload limit and a storage
 * able to take the entry. The entry itself is parsed by the route (DLQ_API).
 */
export function checkEntryAcceptable(
	message: unknown,
	storageAvailable: boolean
): EntryRejection | null {
	if (Buffer.byteLength(JSON.stringify(message)) > MAX_MESSAGE_BYTES) {
		return "too-large";
	}
	return storageAvailable ? null : "storage-unavailable";
}
