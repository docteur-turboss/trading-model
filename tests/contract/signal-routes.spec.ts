import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ResponseProtocol } from "@trading-model/http/response-protocol";
import express from "express";
import { ScraperSignalHistory } from "../../packages/http/src/signals/scraper-signal-history";
import { FINANCIAL_ROUTES } from "../../services/financial-scraper/src/adapters/inbound/http/routes";
import { MySqlSignalStore } from "../../services/financial-scraper/src/adapters/outbound/persistence/signal-store";

/**
 * Signal contract: trader-trainer's `ScraperSignalHistory` → financial-scraper's
 * `GET /signals/assets/:assetId`. The real adapter reads over HTTP from the
 * real route; only the MySQL store and the mTLS client are replaced (the
 * client keeps its schema check).
 */

let baseUrl = "";
jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: {
		createWithTls: () => ({
			get: async (url: string, _options: unknown, schema: any) => {
				const res = await fetch(url.replace(/^https:\/\/[^/]+/, baseUrl));
				if (!res.ok) {
					throw new Error(`${res.status}`);
				}
				return schema.parse(await res.json());
			},
		}),
	},
}));

const SIGNAL = (n: number) => ({
	id: n.toString(16).padStart(64, "0"),
	schemaVersion: 1,
	sourceId: "binance",
	assetId: "BTC",
	sector: null,
	area: null,
	observedAt: new Date(
		Date.parse("2026-01-01T00:00:00.000Z") + n * 1000
	).toISOString(),
	ingestedAt: "2026-01-01T00:00:00.000Z",
	confidenceScore: 1,
	dimension: "market",
	payload: { metric: "close", value: n, unit: "USD" },
});

describe("signal contract: trader-trainer → financial-scraper", () => {
	let server: Server;

	beforeAll(async () => {
		const app = express();
		app.use(FINANCIAL_ROUTES());
		app.use(ResponseProtocol);
		await new Promise<void>((resolve) => {
			server = app.listen(0, "127.0.0.1", resolve);
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	const history = new ScraperSignalHistory(
		{} as never,
		async () => ({ host: "scraper", port: 3000 }) as never
	);

	it("reads a window the route cuts, once each, and rejects an unknown asset", async () => {
		const all = Array.from({ length: 5002 }, (_, n) => SIGNAL(n));
		jest
			.spyOn(MySqlSignalStore, "findForAsset")
			.mockImplementation(
				async ({ from, to, limit }: any) =>
					all
						.filter(
							(s) =>
								Date.parse(s.observedAt) >= from &&
								Date.parse(s.observedAt) < to
						)
						.slice(0, limit) as never
			);

		const signals = await history.loadWindow(
			"BTC",
			Date.parse("2026-01-01T00:00:00.000Z"),
			Date.parse("2026-01-02T00:00:00.000Z")
		);

		expect(signals.map((s) => s.id)).toEqual(all.map((s) => s.id));
		await expect(history.loadWindow("NOPE", 0, 1)).rejects.toThrow("404");
	});
});
