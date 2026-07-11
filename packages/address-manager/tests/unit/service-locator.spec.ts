import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Protocol } from "@trading-model/common/contracts/service-registry.types";
import {
	IPAddress,
	Port,
	toDurationMs,
	toInstanceId,
	toServiceId,
	toVersion,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../../src/client/type";
import type { DnsResolver } from "../../src/discovery/dns-resolver";
import {
	IpAddressLocator,
	MappingServiceLocator,
	MapResolver,
	ServiceNameLocator,
} from "../../src/discovery/service-locator";

describe("ServiceNameLocator", () => {
	let locator: ServiceNameLocator;
	let instance: ServiceInstance;

	beforeEach(() => {
		locator = new ServiceNameLocator();
		instance = {
			host: IPAddress.of("192.168.1.1"),
			port: Port.of(3000),
			instanceId: toInstanceId("instance-1"),
			lastHeartbeat: UnixTimestamp.of(1_700_000_000_000),
			protocol: Protocol.Http,
			registeredAt: UnixTimestamp.of(1_700_000_000_000),
			serviceName: toServiceId("my-service"),
			version: toVersion("1.0.0"),
			ttl: toDurationMs(30000),
		};
	});

	test("locate returns instance.serviceName", () => {
		const result = locator.locate(instance);
		expect(result).toBe("my-service");
	});

	test("resolve returns the given serviceName", () => {
		const result = locator.resolve(toServiceId("other-service"));
		expect(result).toBe("other-service");
	});
});

describe("IpAddressLocator", () => {
	let locator: IpAddressLocator;
	let instance: ServiceInstance;

	beforeEach(() => {
		locator = new IpAddressLocator();
		instance = {
			host: IPAddress.of("10.0.0.5"),
			port: Port.of(8080),
			instanceId: toInstanceId("instance-2"),
			lastHeartbeat: UnixTimestamp.of(1_700_000_000_000),
			protocol: Protocol.Http,
			registeredAt: UnixTimestamp.of(1_700_000_000_000),
			serviceName: toServiceId("my-service"),
			version: toVersion("1.0.0"),
			ttl: toDurationMs(30000),
		};
	});

	test("locate returns instance.host", () => {
		const result = locator.locate(instance);
		expect(result).toBe("10.0.0.5");
	});

	test("resolve returns the given serviceName", () => {
		const result = locator.resolve(toServiceId("some-service"));
		expect(result).toBe("some-service");
	});
});

describe("MapResolver", () => {
	let instance: ServiceInstance;

	beforeEach(() => {
		instance = {
			host: IPAddress.of("192.168.1.1"),
			port: Port.of(3000),
			instanceId: toInstanceId("instance-1"),
			lastHeartbeat: UnixTimestamp.of(1_700_000_000_000),
			protocol: Protocol.Http,
			registeredAt: UnixTimestamp.of(1_700_000_000_000),
			serviceName: toServiceId("my-service"),
			version: toVersion("1.0.0"),
			ttl: toDurationMs(30000),
		};
	});

	test("locate returns mapped host when mapping exists", () => {
		const locator = new MapResolver({
			"my-service": "my-service.prod.svc.cluster.local",
		} as Record<
			import("@trading-model/common/domain/primitives").ServiceId,
			string
		>);
		const result = locator.locate(instance);
		expect(result).toBe("my-service.prod.svc.cluster.local");
	});

	test("locate falls back to serviceName when no mapping exists", () => {
		const locator = new MapResolver({});
		const result = locator.locate(instance);
		expect(result).toBe("my-service");
	});

	test("resolve returns mapped host when mapping exists", () => {
		const locator = new MapResolver({
			"api-service": "api.example.com",
		} as Record<
			import("@trading-model/common/domain/primitives").ServiceId,
			string
		>);
		const result = locator.resolve(toServiceId("api-service"));
		expect(result).toBe("api.example.com");
	});

	test("resolve falls back to serviceName when no mapping exists", () => {
		const locator = new MapResolver({});
		const result = locator.resolve(toServiceId("unknown-service"));
		expect(result).toBe("unknown-service");
	});
});

describe("MappingServiceLocator", () => {
	let instance: ServiceInstance;

	beforeEach(() => {
		instance = {
			host: IPAddress.of("192.168.1.1"),
			port: Port.of(3000),
			instanceId: toInstanceId("instance-1"),
			lastHeartbeat: UnixTimestamp.of(1_700_000_000_000),
			protocol: Protocol.Http,
			registeredAt: UnixTimestamp.of(1_700_000_000_000),
			serviceName: toServiceId("my-service"),
			version: toVersion("1.0.0"),
			ttl: toDurationMs(30000),
		};
	});

	test("locate delegates to DnsResolver.resolve with serviceId", () => {
		const dnsResolver: DnsResolver = {
			resolve: jest
				.fn<(_: string) => string>()
				.mockReturnValue("resolved-host"),
		};
		const locator = new MappingServiceLocator(dnsResolver);
		const result = locator.locate(instance);
		expect(result).toBe("resolved-host");
		expect(dnsResolver.resolve).toHaveBeenCalledTimes(1);
	});

	test("resolve delegates to DnsResolver.resolve", () => {
		const dnsResolver: DnsResolver = {
			resolve: jest
				.fn<(_: string) => string>()
				.mockReturnValue("resolved-name"),
		};
		const locator = new MappingServiceLocator(dnsResolver);
		const result = locator.resolve(toServiceId("some-service"));
		expect(result).toBe("resolved-name");
		expect(dnsResolver.resolve).toHaveBeenCalledWith(
			toServiceId("some-service")
		);
	});
});
