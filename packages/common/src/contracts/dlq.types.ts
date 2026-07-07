import type { UnixTimestamp } from "../domain/primitives";

export interface DlqEntry {
	id?: string;
	topic?: string;
	message: unknown;
	reason?: string;
	deliveryAttempt: number;
	timestamp: UnixTimestamp;
	messageId?: string;
}
