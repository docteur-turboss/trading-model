const get = jest.fn<any, any[]>();
jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: { createWithTls: () => ({ get }) },
}));

import { ScraperSignalHistory } from "../../../src/signals/scraper-signal-history";

const AT = Date.parse("2026-01-01T01:00:00.000Z");
const signal = (id: string, observedAt: string) => ({ id, observedAt });

describe("ScraperSignalHistory", () => {
	const history = new ScraperSignalHistory(
		{} as never,
		async () => ({ host: "scraper", port: 3000 }) as never
	);

	it("rereads a truncated window without duplicate and drops later signals", async () => {
		get
			.mockResolvedValueOnce({
				signals: [
					signal("a", "2026-01-01T00:00:00.000Z"),
					signal("b", "2026-01-01T00:10:00.000Z"),
				],
				truncated: true,
			})
			.mockResolvedValueOnce({
				signals: [
					signal("b", "2026-01-01T00:10:00.000Z"),
					signal("c", "2026-01-01T00:20:00.000Z"),
					signal("late", "2026-01-01T01:00:00.001Z"),
				],
				truncated: false,
			});

		const signals = await history.loadWindow("BTC", AT - 3_600_000, AT);

		expect(signals.map((s) => s.id)).toEqual(["a", "b", "c"]);
		expect(get.mock.calls[1][0]).toContain("from=2026-01-01T00:10:00.000Z");
	});
});
