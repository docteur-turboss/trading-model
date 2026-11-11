import { describe, expect, it } from "@jest/globals";
import { actorOf } from "../../src/adapters/inbound/actor";

const GATEWAY = "spiffe://trading-model.local/ns/trading-model/sa/api-gateway";
const SCRAPER =
	"spiffe://trading-model.local/ns/trading-model/sa/financial-scraper";

function request(clientIdentity: string | undefined, actor?: string) {
	return {
		clientIdentity,
		headers: actor === undefined ? {} : { "x-actor": actor },
	} as never;
}

describe("actorOf", () => {
	it("reads x-actor when the mTLS caller is api-gateway", () => {
		expect(actorOf(request(GATEWAY, "ops-alice"))).toBe("ops-alice");
	});

	it("ignores x-actor from any other caller", () => {
		expect(actorOf(request(SCRAPER, "ops-alice"))).toBeNull();
	});

	it("ignores a non-SPIFFE identity, even one mapped to the gateway (client:)", () => {
		expect(actorOf(request("client:0123abcd", "ops-alice"))).toBeNull();
	});

	it("is null without an mTLS identity or without the header", () => {
		expect(actorOf(request(undefined, "ops-alice"))).toBeNull();
		expect(actorOf(request(GATEWAY))).toBeNull();
		expect(actorOf(request(GATEWAY, ""))).toBeNull();
	});
});
