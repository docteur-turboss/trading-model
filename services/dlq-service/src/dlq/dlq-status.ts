export const DLQ_STATUS = {
	COMPLETED: "completed",
	ABANDONED: "abandoned",
	PENDING: "pending",
	PROCESSING: "processing",
} as const;

export type DlqStatus = (typeof DLQ_STATUS)[keyof typeof DLQ_STATUS];
