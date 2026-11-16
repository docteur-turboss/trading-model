export interface MongoDlqImportReport {
	/** Entries still waiting in MongoDB (any status but `completed`). */
	eligible: number;
	written: number;
	alreadyImported: number;
	/** `_id`s without topic or service: nothing to give them back to. */
	unusable: string[];
}
