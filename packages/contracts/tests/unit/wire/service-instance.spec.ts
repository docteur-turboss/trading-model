import { describe, expect, it } from "@jest/globals";
import { ServiceInstanceWire } from "../../../src/wire/service-instance";

/** What discovery-server answers on `GET /services/:serviceName`. */
const FROM_DISCOVERY = {
	instanceId: "trader-trainer-1",
	serviceName: "trader-trainer",
	host: "10.0.0.7",
	port: 3000,
	version: "1.4.0",
	protocol: "mtls",
	ttl: 30_000,
	registeredAt: 1_761_609_600_000,
	lastHeartbeat: 1_761_609_615_000,
};

describe("ServiceInstanceWire", () => {
	it("accepts the instances discovery sends", () => {
		expect(ServiceInstanceWire.parse(FROM_DISCOVERY)).toEqual(FROM_DISCOVERY);
	});

	it("rejects an instance whose host is not an IP address", () => {
		expect(() =>
			ServiceInstanceWire.parse({ ...FROM_DISCOVERY, host: "not an ip" })
		).toThrow();
	});

	it("rejects an unknown protocol", () => {
		expect(() =>
			ServiceInstanceWire.parse({ ...FROM_DISCOVERY, protocol: "ftp" })
		).toThrow();
	});
});
