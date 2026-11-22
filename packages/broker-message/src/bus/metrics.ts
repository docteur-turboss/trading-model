import promClient from "prom-client";

/** Deliveries of a bus entry to a handler (`success`) or its failed attempts (`failed`). */
export const MESSAGES_DELIVERED_TOTAL = new promClient.Counter({
	name: "mm_messages_delivered_total",
	help: "Total number of messages delivered",
	labelNames: ["topic", "status"] as const,
});

export const MESSAGES_DLQ_TOTAL = new promClient.Counter({
	name: "mm_messages_dlq_total",
	help: "Total number of messages sent to DLQ",
	labelNames: ["topic", "reason"] as const,
});

export const JOURNAL_TRIMMED_PENDING_TOTAL = new promClient.Counter({
	name: "mm_journal_trimmed_pending_total",
	help: "Journal entries trimmed (24 h) before their service received them: messages lost",
	labelNames: ["topic", "service"] as const,
});

export const JOURNAL_UNREADABLE_TOTAL = new promClient.Counter({
	name: "mm_journal_unreadable_total",
	help: "Journal entries whose message field is not JSON, acknowledged and dropped",
	labelNames: ["topic", "service"] as const,
});

export const JOURNAL_PENDING_ENTRIES = new promClient.Gauge({
	name: "mm_journal_pending_entries",
	help: "Journal entries of a topic not yet acknowledged by a subscriber service (delivered or not)",
	labelNames: ["topic", "service"] as const,
});

export const JOURNAL_OLDEST_PENDING_AGE_SECONDS = new promClient.Gauge({
	name: "mm_journal_oldest_pending_age_seconds",
	help: "Age of the oldest journal entry a subscriber service has not acknowledged (trimmed after 24 h)",
	labelNames: ["topic", "service"] as const,
});

export const BUS_DEAD_LETTERS = new promClient.Gauge({
	name: "bus_dead_letters",
	help: "Entries in the dead stream of a topic: dead letters an operator has not replayed or deleted yet (ADR-0073)",
	labelNames: ["topic"] as const,
});

/** Entries dropped because their `publisher` is not allowed on the topic (EVENT_PUBLISHERS, issue #1620). */
export const PUBLISHER_REJECTED_TOTAL = new promClient.Counter({
	name: "bus_publisher_rejected_total",
	help: "Bus entries rejected: publisher not allowed on the topic",
	labelNames: ["topic", "publisher"] as const,
});
