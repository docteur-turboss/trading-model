import { describe, expect, it } from "@jest/globals";
import {
	AuthToken,
	ClientIdentity,
	Environment,
	Role,
	Subject,
	toAuthToken,
	toEnvironment,
	toRole,
	toSubject,
} from "../../../src/primitives/auth-ids";
import {
	CaPem,
	CertPem,
	KeyPem,
} from "../../../src/primitives/certificate-ids";
import { DbName, DbPassword, DbUser } from "../../../src/primitives/db-ids";
import {
	GenomeId,
	InstanceId,
	Region,
	ServiceId,
	TenantId,
	toInstanceId,
	toRegion,
	toServiceId,
	toTenantId,
	toVersion,
	Version,
} from "../../../src/primitives/general-ids";
import {
	CorrelationId,
	MessageId,
	MessagePriority,
	Topic,
	toCorrelationId,
	toMessageId,
	toTopic,
} from "../../../src/primitives/messaging-ids";
import {
	DurationMs,
	SequenceNumber,
	toDurationMs,
} from "../../../src/primitives/time-ids";

// Every brand below is a plain createStringBrand: same behaviour, one table.
describe.each([
	["ServiceId", ServiceId, "my-service", toServiceId],
	["InstanceId", InstanceId, "i-123", toInstanceId],
	["Region", Region, "us-east-1", toRegion],
	["Topic", Topic, "market-data", toTopic],
	["CorrelationId", CorrelationId, "corr-123", toCorrelationId],
	["MessageId", MessageId, "msg-abc", toMessageId],
	["Version", Version, "1.0.0", toVersion],
	["GenomeId", GenomeId, "genome-x", undefined],
	["TenantId", TenantId, "tenant-42", toTenantId],
	["AuthToken", AuthToken, "tok-abc", toAuthToken],
	["ClientIdentity", ClientIdentity, "ci-123", undefined],
	["Subject", Subject, "spiffe://example/foo", toSubject],
	["Role", Role, "admin", toRole],
	["Environment", Environment, "production", toEnvironment],
	["DbUser", DbUser, "app_user", undefined],
	["DbName", DbName, "trading_db", undefined],
] as const)("%s", (_name, brand, sample, to) => {
	it("should create and convert", () => {
		expect(brand.of(sample)).toBe(sample);
		if (to) {
			expect(to(sample)).toBe(sample);
		}
	});

	it("should throw for empty string", () => {
		expect(() => brand.of("")).toThrow(RangeError);
	});
});

describe("CertPem", () => {
	it("should create and convert", () => {
		const pem = "-----BEGIN CERTIFICATE-----\ndata\n-----END CERTIFICATE-----";
		expect(CertPem.of(pem)).toContain("-----BEGIN");
	});

	it("should throw for non-PEM string", () => {
		expect(() => CertPem.of("just-data")).toThrow(RangeError);
	});
});

describe("MessagePriority", () => {
	it("should create and convert", () => {
		expect(MessagePriority.of(5)).toBe(5);
	});

	it("should throw for non-integer", () => {
		expect(() => MessagePriority.of(1.5)).toThrow(RangeError);
	});
});

describe("DurationMs", () => {
	it("should create a valid duration", () => {
		expect(DurationMs.of(1000)).toBe(1000);
		expect(DurationMs.of(0)).toBe(0);
	});

	it("should throw for negative", () => {
		expect(() => DurationMs.of(-1)).toThrow(RangeError);
	});

	it("should throw for non-finite", () => {
		expect(() => DurationMs.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
	});

	it("should return zero", () => {
		expect(DurationMs.zero()).toBe(0);
	});

	it("should convert via helper functions", () => {
		expect(toDurationMs(1000)).toBe(1000);
	});
});

describe("SequenceNumber", () => {
	it("should create a valid sequence number", () => {
		expect(SequenceNumber.of(0)).toBe(0);
		expect(SequenceNumber.of(100)).toBe(100);
	});

	it("should throw for negative", () => {
		expect(() => SequenceNumber.of(-1)).toThrow(RangeError);
	});

	it("should throw for non-integer", () => {
		expect(() => SequenceNumber.of(1.5)).toThrow(RangeError);
	});
});

describe("DbPassword", () => {
	it("should create and convert", () => {
		expect(DbPassword.of("s3cret")).toBe("s3cret");
	});
	it("should allow empty password", () => {
		expect(DbPassword.of("")).toBe("");
	});
});

describe("CaPem", () => {
	it("should create and convert valid PEM", () => {
		const pem = "-----BEGIN CERTIFICATE-----\ndata\n-----END CERTIFICATE-----";
		expect(CaPem.of(pem)).toBe(pem);
	});
	it("should throw for non-PEM string", () => {
		expect(() => CaPem.of("just-data")).toThrow(RangeError);
	});
});

describe("KeyPem", () => {
	it("should create and convert valid PEM", () => {
		const pem = "-----BEGIN PRIVATE KEY-----\ndata\n-----END PRIVATE KEY-----";
		expect(KeyPem.of(pem)).toBe(pem);
	});
	it("should throw for non-PEM string", () => {
		expect(() => KeyPem.of("just-data")).toThrow(RangeError);
	});
});
