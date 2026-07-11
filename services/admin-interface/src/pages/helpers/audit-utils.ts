import type { Severity } from "@trading-model/common/contracts/admin";
import type {
	CorrelationId,
	ISODateTime,
	ServiceId,
	Topic,
} from "@trading-model/common/domain/primitives";

export function createAuditColumns() {
	return [
		{
			id: "timestamp",
			label: "Timestamp",
			render: (row: { timestamp: ISODateTime }) => row.timestamp,
		},
		{
			id: "topic",
			label: "Topic",
			render: (row: { topic: Topic }) => row.topic,
		},
		{
			id: "publisher",
			label: "Publisher",
			render: (row: { publisher: ServiceId }) => row.publisher,
		},
		{
			id: "cid",
			label: "Correlation ID",
			render: (row: { correlationId: CorrelationId }) => row.correlationId,
		},
		{
			id: "summary",
			label: "Summary",
			render: (row: { summary: string }) => row.summary,
		},
		{
			id: "severity",
			label: "Severity",
			render: (row: { severity: Severity }) => row.severity,
		},
	];
}
