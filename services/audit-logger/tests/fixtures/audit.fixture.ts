import type {
	AuditEventDocument,
	AuditStats,
	PaginatedResult,
} from "../../src/adapters/outbound/persistence/audit-repository";

export const createAuditEvent = (
	overrides?: Partial<AuditEventDocument>
): AuditEventDocument =>
	({
		receivedAt: new Date() as any,
		metadata: {
			topic: "test-topic" as any,
			eventType: "test.event" as any,
			publisher: "test-service" as any,
			instanceId: "instance-1" as any,
			messageId: "msg-1" as any,
			correlationId: "corr-1" as any,
		},
		payload: { key: "value" },
		...overrides,
	}) as any;

export const createPaginatedResult = (
	overrides?: Partial<PaginatedResult<AuditEventDocument>>
): PaginatedResult<AuditEventDocument> =>
	({
		data: [createAuditEvent()],
		pagination: {
			page: 1 as any,
			limit: 100 as any,
			total: 1,
			totalPages: 1,
		},
		...overrides,
	}) as any;

export const createAuditStats = (overrides?: Partial<AuditStats>): AuditStats =>
	({
		totalEvents: 10,
		eventsByTopic: { "test-topic": 10 },
		eventsByPublisher: { "test-service": 10 },
		dateRange: {
			earliest: new Date("2024-01-01") as any,
			latest: new Date("2024-12-31") as any,
		},
		...overrides,
	}) as any;
