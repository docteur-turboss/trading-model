import { describe, expect, it } from "@jest/globals";
import {
	AuthToken,
	ClientIdentity,
	Environment,
	ProcessId,
	Role,
	Subject,
	toAuthToken,
	toEnvironment,
	toRole,
	toSubject,
	UserId,
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

describe("ServiceId", () => {
	it("should create and convert", () => {
		expect(ServiceId.of("my-service")).toBe("my-service");
		expect(toServiceId("my-service")).toBe("my-service");
	});

	it("should throw for empty string", () => {
		expect(() => ServiceId.of("")).toThrow(RangeError);
	});
});

describe("InstanceId", () => {
	it("should create and convert", () => {
		expect(InstanceId.of("i-123")).toBe("i-123");
		expect(toInstanceId("i-123")).toBe("i-123");
	});

	it("should throw for empty string", () => {
		expect(() => InstanceId.of("")).toThrow(RangeError);
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

describe("Region", () => {
	it("should create and convert", () => {
		expect(Region.of("us-east-1")).toBe("us-east-1");
		expect(toRegion("us-east-1")).toBe("us-east-1");
	});
	it("should throw for empty string", () => {
		expect(() => Region.of("")).toThrow(RangeError);
	});
});

describe("Topic", () => {
	it("should create and convert", () => {
		expect(Topic.of("market-data")).toBe("market-data");
		expect(toTopic("market-data")).toBe("market-data");
	});
	it("should throw for empty string", () => {
		expect(() => Topic.of("")).toThrow(RangeError);
	});
});

describe("CorrelationId", () => {
	it("should create and convert", () => {
		expect(CorrelationId.of("corr-123")).toBe("corr-123");
		expect(toCorrelationId("corr-123")).toBe("corr-123");
	});
	it("should throw for empty string", () => {
		expect(() => CorrelationId.of("")).toThrow(RangeError);
	});
});

describe("MessageId", () => {
	it("should create and convert", () => {
		expect(MessageId.of("msg-abc")).toBe("msg-abc");
		expect(toMessageId("msg-abc")).toBe("msg-abc");
	});
	it("should throw for empty string", () => {
		expect(() => MessageId.of("")).toThrow(RangeError);
	});
});

describe("Version", () => {
	it("should create and convert", () => {
		expect(Version.of("1.0.0")).toBe("1.0.0");
		expect(toVersion("1.0.0")).toBe("1.0.0");
	});
	it("should throw for empty string", () => {
		expect(() => Version.of("")).toThrow(RangeError);
	});
});

describe("GenomeId", () => {
	it("should create and convert", () => {
		expect(GenomeId.of("genome-x")).toBe("genome-x");
	});
	it("should throw for empty string", () => {
		expect(() => GenomeId.of("")).toThrow(RangeError);
	});
});

describe("TenantId", () => {
	it("should create and convert", () => {
		expect(TenantId.of("tenant-42")).toBe("tenant-42");
		expect(toTenantId("tenant-42")).toBe("tenant-42");
	});
	it("should throw for empty string", () => {
		expect(() => TenantId.of("")).toThrow(RangeError);
	});
});

describe("UserId", () => {
	it("should create and convert", () => {
		expect(UserId.of("user-abc")).toBe("user-abc");
	});
	it("should throw for empty string", () => {
		expect(() => UserId.of("")).toThrow(RangeError);
	});
});

describe("ProcessId", () => {
	it("should create and convert", () => {
		expect(ProcessId.of("sess-xyz")).toBe("sess-xyz");
	});
	it("should throw for empty string", () => {
		expect(() => ProcessId.of("")).toThrow(RangeError);
	});
});

describe("AuthToken", () => {
	it("should create and convert", () => {
		expect(AuthToken.of("tok-abc")).toBe("tok-abc");
		expect(toAuthToken("tok-abc")).toBe("tok-abc");
	});
	it("should throw for empty string", () => {
		expect(() => AuthToken.of("")).toThrow(RangeError);
	});
});

describe("ClientIdentity", () => {
	it("should create and convert", () => {
		expect(ClientIdentity.of("ci-123")).toBe("ci-123");
	});
	it("should throw for empty string", () => {
		expect(() => ClientIdentity.of("")).toThrow(RangeError);
	});
});

describe("Subject", () => {
	it("should create and convert", () => {
		expect(Subject.of("spiffe://example/foo")).toBe("spiffe://example/foo");
		expect(toSubject("spiffe://example/foo")).toBe("spiffe://example/foo");
	});
	it("should throw for empty string", () => {
		expect(() => Subject.of("")).toThrow(RangeError);
	});
});

describe("Role", () => {
	it("should create and convert", () => {
		expect(Role.of("admin")).toBe("admin");
		expect(toRole("admin")).toBe("admin");
	});
	it("should throw for empty string", () => {
		expect(() => Role.of("")).toThrow(RangeError);
	});
});

describe("Environment", () => {
	it("should create and convert", () => {
		expect(Environment.of("production")).toBe("production");
		expect(toEnvironment("production")).toBe("production");
	});
	it("should throw for empty string", () => {
		expect(() => Environment.of("")).toThrow(RangeError);
	});
});

describe("DbUser", () => {
	it("should create and convert", () => {
		expect(DbUser.of("app_user")).toBe("app_user");
	});
	it("should throw for empty string", () => {
		expect(() => DbUser.of("")).toThrow(RangeError);
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

describe("DbName", () => {
	it("should create and convert", () => {
		expect(DbName.of("trading_db")).toBe("trading_db");
	});
	it("should throw for empty string", () => {
		expect(() => DbName.of("")).toThrow(RangeError);
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
