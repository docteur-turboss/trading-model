import type {
	AuditEventDocument,
	AuditStats,
	PaginatedResult,
} from "../../src/persistence/audit-repository";

export const createAuditEvent = (
	overrides?: Partial<AuditEventDocument>
): AuditEventDocument => ({
	receivedAt: new Date(),
	metadata: {
		topic: "test-topic",
		eventType: "test.event",
		publisher: "test-service",
		instanceId: "instance-1",
		messageId: "msg-1",
		correlationId: "corr-1",
	},
	payload: { key: "value" },
	...overrides,
});

export const createPaginatedResult = (
	overrides?: Partial<PaginatedResult<AuditEventDocument>>
): PaginatedResult<AuditEventDocument> => ({
	data: [createAuditEvent()],
	pagination: {
		page: 1,
		limit: 100,
		total: 1,
		totalPages: 1,
	},
	...overrides,
});

export const createAuditStats = (
	overrides?: Partial<AuditStats>
): AuditStats => ({
	totalEvents: 10,
	eventsByTopic: { "test-topic": 10 },
	eventsByPublisher: { "test-service": 10 },
	dateRange: {
		earliest: new Date("2024-01-01"),
		latest: new Date("2024-12-31"),
	},
	...overrides,
});
