import type { AddressInfo } from "node:net";
import { describe, expect, it } from "@jest/globals";
import express from "express";
import { MODEL_DOWNLOAD_GUARD } from "../../../src/adapters/inbound/http/model-download-guard";

async function status(guard: express.RequestHandler): Promise<number> {
	const app = express();
	app.get("/weights", guard, (_req, res) => {
		res.status(200).end();
	});
	const server = app.listen(0);
	try {
		const { port } = server.address() as AddressInfo;
		return (await fetch(`http://127.0.0.1:${port}/weights`)).status;
	} finally {
		server.close();
	}
}

describe("MODEL_DOWNLOAD_GUARD", () => {
	it("refuses a caller without a client certificate (plain HTTP has none)", async () => {
		expect(await status(MODEL_DOWNLOAD_GUARD(["trade-executor"]))).toBe(401);
	});

	it("refuses everybody with an empty list (the default)", async () => {
		expect(await status(MODEL_DOWNLOAD_GUARD([], () => "trader-trainer"))).toBe(
			403
		);
	});

	it("compares canonical names: a legacy name in the list still matches", async () => {
		const guard = MODEL_DOWNLOAD_GUARD(
			["financial-scraper-service"],
			() => "financial-scraper"
		);

		expect(await status(guard)).toBe(200);
	});
});
