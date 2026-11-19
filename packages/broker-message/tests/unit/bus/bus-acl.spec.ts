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

/** Topics of the `bus_user <service> "<password>" "<published>" "<subscribed>"` line. */
function aclTopics(service: string): [string[], string[]] {
	const line = SCRIPT.split("\n").find((l) =>
		l.includes(`bus_user ${service} `)
	);
	const quoted = [...(line ?? "").matchAll(/"([^"]*)"/g)].map((m) => m[1]);
	const list = (value = "") => value.split(" ").filter(Boolean).sort();
	return [list(quoted[1]), list(quoted[2])];
}

describe("redis-ha.sh bus users", () => {
	it.each([
		"audit-logger",
		"trader-trainer",
		"model-evaluator",
		"financial-scraper",
	])(
		"should grant %s the topics of EVENT_PUBLISHERS and EVENT_SUBSCRIBERS",
		(service) => {
			const published = Object.entries(EVENT_PUBLISHERS)
				.filter(([, names]) => names.some((name) => name === service))
				.map(([topic]) => topic)
				.sort();
			const subscribed = [
				...((EVENT_SUBSCRIBERS as Record<string, readonly string[]>)[service] ??
					[]),
			].sort();

			expect(aclTopics(service)).toEqual([published, subscribed]);
		}
	);
});
