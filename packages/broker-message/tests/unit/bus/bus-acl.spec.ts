import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import {
	EVENT_PUBLISHERS,
	EVENT_SUBSCRIBERS,
} from "@trading-model/contracts/event-routes";

const SCRIPT = readFileSync(
	join(__dirname, "../../../../../deploy/k8s/infra/redis-ha.sh"),
	"utf8"
);

describe("redis-ha.sh bus users", () => {
	it("should grant every bus service the topics of EVENT_PUBLISHERS and EVENT_SUBSCRIBERS", () => {
		const subs = EVENT_SUBSCRIBERS as Record<string, readonly string[]>;
		for (const service of [
			"audit-logger",
			"trader-trainer",
			"model-evaluator",
			"risk-execution",
			"decision-consumer",
		]) {
			const line = SCRIPT.split("\n").find((l) =>
				l.includes(`bus_user ${service} `)
			);
			const [, published = "", subscribed = ""] = [
				...(line ?? "").matchAll(/"([^"]*)"/g),
			].map((m) => m[1] as string);
			const topics = (v: string) => v.split(" ").filter(Boolean).sort();
			const expected = Object.entries(EVENT_PUBLISHERS)
				.filter(([, names]) => names.some((n) => n === service))
				.map(([t]) => t)
				.sort();
			expect(topics(published)).toEqual(expected);
			expect(topics(subscribed)).toEqual([...(subs[service] ?? [])].sort());
		}
	});
});
