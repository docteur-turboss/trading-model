export function createAuditColumns() {
	return [
		{
			id: "timestamp",
			label: "Timestamp",
			render: (row: { timestamp: string }) => row.timestamp,
		},
		{
			id: "topic",
			label: "Topic",
			render: (row: { topic: string }) => row.topic,
		},
		{
			id: "publisher",
			label: "Publisher",
			render: (row: { publisher: string }) => row.publisher,
		},
		{
			id: "cid",
			label: "Correlation ID",
			render: (row: { correlationId: string }) => row.correlationId,
		},
		{
			id: "summary",
			label: "Summary",
			render: (row: { summary: string }) => row.summary,
		},
		{
			id: "severity",
			label: "Severity",
			render: (row: { severity: string }) => row.severity,
		},
	];
}
