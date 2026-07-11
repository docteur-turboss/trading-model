import { describe, expect, it } from "@jest/globals";
import {
	AuthToken,
	CaPem,
	Capability,
	CertPem,
	ClientIdentity,
	CorrelationId,
	CsrPem,
	DbName,
	DbPassword,
	DbUser,
	DurationMs,
	Environment,
	Fingerprint,
	fromAuthToken,
	fromCaPem,
	fromCapability,
	fromCertPem,
	fromClientIdentity,
	fromCorrelationId,
	fromCsrPem,
	fromDbName,
	fromDbPassword,
	fromDbUser,
	fromDurationMs,
	fromEnvironment,
	fromFingerprint,
	fromGenomeId,
	fromInstanceId,
	fromISODateTime,
	fromJobId,
	fromJobType,
	fromKeyId,
	fromKeyPem,
	fromKeyVersion,
	fromMessageId,
	fromMessagePriority,
	fromModelId,
	fromRegion,
	fromRole,
	fromSequenceNumber,
	fromSerialNumber,
	fromServiceId,
	fromSessionId,
	fromSubject,
	fromTenantId,
	fromTopic,
	fromUserId,
	fromVersion,
	GenomeId,
	InstanceId,
	ISODateTime,
	JobId,
	JobType,
	KeyId,
	KeyPem,
	KeyVersion,
	MessageId,
	MessagePriority,
	ModelId,
	Region,
	Role,
	SequenceNumber,
	SerialNumber,
	ServiceId,
	SessionId,
	Subject,
	TenantId,
	Topic,
	toAuthToken,
	toCaPem,
	toCapability,
	toCertPem,
	toClientIdentity,
	toCorrelationId,
	toCsrPem,
	toDbName,
	toDbPassword,
	toDbUser,
	toDurationMs,
	toEnvironment,
	toFingerprint,
	toGenomeId,
	toInstanceId,
	toISODateTime,
	toJobId,
	toJobType,
	toKeyId,
	toKeyPem,
	toKeyVersion,
	toMessageId,
	toMessagePriority,
	toModelId,
	toRegion,
	toRole,
	toSequenceNumber,
	toSerialNumber,
	toServiceId,
	toSessionId,
	toSubject,
	toTenantId,
	toTopic,
	toUserId,
	toVersion,
	UserId,
	Version,
} from "../../../../src/domain/primitives/string-ids";

describe("ServiceId", () => {
	it("should create and convert", () => {
		expect(ServiceId.of("my-service")).toBe("my-service");
		expect(toServiceId("my-service")).toBe("my-service");
		expect(fromServiceId("my-service" as never)).toBe("my-service");
	});

	it("should throw for empty string", () => {
		expect(() => ServiceId.of("")).toThrow(RangeError);
	});
});

describe("InstanceId", () => {
	it("should create and convert", () => {
		expect(InstanceId.of("i-123")).toBe("i-123");
		expect(toInstanceId("i-123")).toBe("i-123");
		expect(fromInstanceId("i-123" as never)).toBe("i-123");
	});

	it("should throw for empty string", () => {
		expect(() => InstanceId.of("")).toThrow(RangeError);
	});
});

describe("ISODateTime", () => {
	it("should create and convert", () => {
		expect(ISODateTime.of("2024-01-01T00:00:00.000Z")).toBe(
			"2024-01-01T00:00:00.000Z"
		);
		expect(toISODateTime("2024-01-01T00:00:00.000Z")).toBe(
			"2024-01-01T00:00:00.000Z"
		);
		expect(fromISODateTime("2024-01-01T00:00:00.000Z" as never)).toBe(
			"2024-01-01T00:00:00.000Z"
		);
	});

	it("should throw for invalid date", () => {
		expect(() => ISODateTime.of("not-a-date")).toThrow(RangeError);
	});
});

describe("CertPem", () => {
	it("should create and convert", () => {
		const pem = "-----BEGIN CERTIFICATE-----\ndata\n-----END CERTIFICATE-----";
		expect(CertPem.of(pem)).toContain("-----BEGIN");
		expect(toCertPem(pem)).toContain("-----BEGIN");
		expect(fromCertPem(pem as never)).toBe(pem);
	});

	it("should throw for non-PEM string", () => {
		expect(() => CertPem.of("just-data")).toThrow(RangeError);
	});
});

describe("KeyVersion", () => {
	it("should create and convert", () => {
		expect(KeyVersion.of(1)).toBe(1);
		expect(KeyVersion.of(0)).toBe(0);
		expect(toKeyVersion(1)).toBe(1);
		expect(fromKeyVersion(1 as never)).toBe(1);
	});

	it("should throw for negative", () => {
		expect(() => KeyVersion.of(-1)).toThrow(RangeError);
	});

	it("should throw for non-integer", () => {
		expect(() => KeyVersion.of(1.5)).toThrow(RangeError);
	});
});

describe("MessagePriority", () => {
	it("should create and convert", () => {
		expect(MessagePriority.of(5)).toBe(5);
		expect(toMessagePriority(5)).toBe(5);
		expect(fromMessagePriority(5 as never)).toBe(5);
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

	it("should convert to seconds and minutes", () => {
		expect(DurationMs.toSeconds(5000 as never)).toBe(5);
		expect(DurationMs.toMinutes(60000 as never)).toBe(1);
	});

	it("should add and multiply", () => {
		expect(DurationMs.add(1000 as never, 2000 as never)).toBe(3000);
		expect(DurationMs.multiply(1000 as never, 3)).toBe(3000);
	});

	it("should compare durations", () => {
		expect(DurationMs.isLongerThan(5000 as never, 3000 as never)).toBe(true);
		expect(DurationMs.isShorterThan(3000 as never, 5000 as never)).toBe(true);
	});

	it("should create from seconds and minutes", () => {
		expect(DurationMs.fromSeconds(5)).toBe(5000);
		expect(DurationMs.fromMinutes(2)).toBe(120000);
	});

	it("should convert via helper functions", () => {
		expect(toDurationMs(1000)).toBe(1000);
		expect(fromDurationMs(1000 as never)).toBe(1000);
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

	it("should return next value", () => {
		expect(SequenceNumber.next(5 as never)).toBe(6);
	});

	it("should convert to number", () => {
		expect(SequenceNumber.toNumber(42 as never)).toBe(42);
	});

	it("should convert via helper functions", () => {
		expect(toSequenceNumber(5)).toBe(5);
		expect(fromSequenceNumber(5 as never)).toBe(5);
	});
});

describe("Region", () => {
	it("should create and convert", () => {
		expect(Region.of("us-east-1")).toBe("us-east-1");
		expect(toRegion("us-east-1")).toBe("us-east-1");
		expect(fromRegion("us-east-1" as never)).toBe("us-east-1");
	});
	it("should throw for empty string", () => {
		expect(() => Region.of("")).toThrow(RangeError);
	});
});

describe("ModelId", () => {
	it("should create and convert", () => {
		expect(ModelId.of("model-v2")).toBe("model-v2");
		expect(toModelId("model-v2")).toBe("model-v2");
		expect(fromModelId("model-v2" as never)).toBe("model-v2");
	});
	it("should throw for empty string", () => {
		expect(() => ModelId.of("")).toThrow(RangeError);
	});
});

describe("Topic", () => {
	it("should create and convert", () => {
		expect(Topic.of("market-data")).toBe("market-data");
		expect(toTopic("market-data")).toBe("market-data");
		expect(fromTopic("market-data" as never)).toBe("market-data");
	});
	it("should throw for empty string", () => {
		expect(() => Topic.of("")).toThrow(RangeError);
	});
});

describe("CorrelationId", () => {
	it("should create and convert", () => {
		expect(CorrelationId.of("corr-123")).toBe("corr-123");
		expect(toCorrelationId("corr-123")).toBe("corr-123");
		expect(fromCorrelationId("corr-123" as never)).toBe("corr-123");
	});
	it("should throw for empty string", () => {
		expect(() => CorrelationId.of("")).toThrow(RangeError);
	});
});

describe("MessageId", () => {
	it("should create and convert", () => {
		expect(MessageId.of("msg-abc")).toBe("msg-abc");
		expect(toMessageId("msg-abc")).toBe("msg-abc");
		expect(fromMessageId("msg-abc" as never)).toBe("msg-abc");
	});
	it("should throw for empty string", () => {
		expect(() => MessageId.of("")).toThrow(RangeError);
	});
});

describe("JobId", () => {
	it("should create and convert", () => {
		expect(JobId.of("job-001")).toBe("job-001");
		expect(toJobId("job-001")).toBe("job-001");
		expect(fromJobId("job-001" as never)).toBe("job-001");
	});
	it("should throw for empty string", () => {
		expect(() => JobId.of("")).toThrow(RangeError);
	});
});

describe("SerialNumber", () => {
	it("should create and convert", () => {
		expect(SerialNumber.of("SN-12345")).toBe("SN-12345");
		expect(toSerialNumber("SN-12345")).toBe("SN-12345");
		expect(fromSerialNumber("SN-12345" as never)).toBe("SN-12345");
	});
	it("should throw for empty string", () => {
		expect(() => SerialNumber.of("")).toThrow(RangeError);
	});
});

describe("Fingerprint", () => {
	it("should create and convert", () => {
		expect(Fingerprint.of("abc123def")).toBe("abc123def");
		expect(toFingerprint("abc123def")).toBe("abc123def");
		expect(fromFingerprint("abc123def" as never)).toBe("abc123def");
	});
	it("should throw for empty string", () => {
		expect(() => Fingerprint.of("")).toThrow(RangeError);
	});
});

describe("Version", () => {
	it("should create and convert", () => {
		expect(Version.of("1.0.0")).toBe("1.0.0");
		expect(toVersion("1.0.0")).toBe("1.0.0");
		expect(fromVersion("1.0.0" as never)).toBe("1.0.0");
	});
	it("should throw for empty string", () => {
		expect(() => Version.of("")).toThrow(RangeError);
	});
});

describe("JobType", () => {
	it("should create and convert", () => {
		expect(JobType.of("training")).toBe("training");
		expect(toJobType("training")).toBe("training");
		expect(fromJobType("training" as never)).toBe("training");
	});
	it("should throw for empty string", () => {
		expect(() => JobType.of("")).toThrow(RangeError);
	});
});

describe("Capability", () => {
	it("should create and convert", () => {
		expect(Capability.of("order-entry")).toBe("order-entry");
		expect(toCapability("order-entry")).toBe("order-entry");
		expect(fromCapability("order-entry" as never)).toBe("order-entry");
	});
	it("should throw for empty string", () => {
		expect(() => Capability.of("")).toThrow(RangeError);
	});
});

describe("KeyId", () => {
	it("should create and convert", () => {
		expect(KeyId.of("key-001")).toBe("key-001");
		expect(toKeyId("key-001")).toBe("key-001");
		expect(fromKeyId("key-001" as never)).toBe("key-001");
	});
	it("should throw for empty string", () => {
		expect(() => KeyId.of("")).toThrow(RangeError);
	});
});

describe("GenomeId", () => {
	it("should create and convert", () => {
		expect(GenomeId.of("genome-x")).toBe("genome-x");
		expect(toGenomeId("genome-x")).toBe("genome-x");
		expect(fromGenomeId("genome-x" as never)).toBe("genome-x");
	});
	it("should throw for empty string", () => {
		expect(() => GenomeId.of("")).toThrow(RangeError);
	});
});

describe("TenantId", () => {
	it("should create and convert", () => {
		expect(TenantId.of("tenant-42")).toBe("tenant-42");
		expect(toTenantId("tenant-42")).toBe("tenant-42");
		expect(fromTenantId("tenant-42" as never)).toBe("tenant-42");
	});
	it("should throw for empty string", () => {
		expect(() => TenantId.of("")).toThrow(RangeError);
	});
});

describe("UserId", () => {
	it("should create and convert", () => {
		expect(UserId.of("user-abc")).toBe("user-abc");
		expect(toUserId("user-abc")).toBe("user-abc");
		expect(fromUserId("user-abc" as never)).toBe("user-abc");
	});
	it("should throw for empty string", () => {
		expect(() => UserId.of("")).toThrow(RangeError);
	});
});

describe("SessionId", () => {
	it("should create and convert", () => {
		expect(SessionId.of("sess-xyz")).toBe("sess-xyz");
		expect(toSessionId("sess-xyz")).toBe("sess-xyz");
		expect(fromSessionId("sess-xyz" as never)).toBe("sess-xyz");
	});
	it("should throw for empty string", () => {
		expect(() => SessionId.of("")).toThrow(RangeError);
	});
});

describe("AuthToken", () => {
	it("should create and convert", () => {
		expect(AuthToken.of("tok-abc")).toBe("tok-abc");
		expect(toAuthToken("tok-abc")).toBe("tok-abc");
		expect(fromAuthToken("tok-abc" as never)).toBe("tok-abc");
	});
	it("should throw for empty string", () => {
		expect(() => AuthToken.of("")).toThrow(RangeError);
	});
});

describe("ClientIdentity", () => {
	it("should create and convert", () => {
		expect(ClientIdentity.of("ci-123")).toBe("ci-123");
		expect(toClientIdentity("ci-123")).toBe("ci-123");
		expect(fromClientIdentity("ci-123" as never)).toBe("ci-123");
	});
	it("should throw for empty string", () => {
		expect(() => ClientIdentity.of("")).toThrow(RangeError);
	});
});

describe("Subject", () => {
	it("should create and convert", () => {
		expect(Subject.of("spiffe://example/foo")).toBe("spiffe://example/foo");
		expect(toSubject("spiffe://example/foo")).toBe("spiffe://example/foo");
		expect(fromSubject("spiffe://example/foo" as never)).toBe(
			"spiffe://example/foo"
		);
	});
	it("should throw for empty string", () => {
		expect(() => Subject.of("")).toThrow(RangeError);
	});
});

describe("Role", () => {
	it("should create and convert", () => {
		expect(Role.of("admin")).toBe("admin");
		expect(toRole("admin")).toBe("admin");
		expect(fromRole("admin" as never)).toBe("admin");
	});
	it("should throw for empty string", () => {
		expect(() => Role.of("")).toThrow(RangeError);
	});
});

describe("Environment", () => {
	it("should create and convert", () => {
		expect(Environment.of("production")).toBe("production");
		expect(toEnvironment("production")).toBe("production");
		expect(fromEnvironment("production" as never)).toBe("production");
	});
	it("should throw for empty string", () => {
		expect(() => Environment.of("")).toThrow(RangeError);
	});
});

describe("DbUser", () => {
	it("should create and convert", () => {
		expect(DbUser.of("app_user")).toBe("app_user");
		expect(toDbUser("app_user")).toBe("app_user");
		expect(fromDbUser("app_user" as never)).toBe("app_user");
	});
	it("should throw for empty string", () => {
		expect(() => DbUser.of("")).toThrow(RangeError);
	});
});

describe("DbPassword", () => {
	it("should create and convert", () => {
		expect(DbPassword.of("s3cret")).toBe("s3cret");
		expect(toDbPassword("s3cret")).toBe("s3cret");
		expect(fromDbPassword("s3cret" as never)).toBe("s3cret");
	});
	it("should throw for empty string", () => {
		expect(() => DbPassword.of("")).toThrow(RangeError);
	});
});

describe("DbName", () => {
	it("should create and convert", () => {
		expect(DbName.of("trading_db")).toBe("trading_db");
		expect(toDbName("trading_db")).toBe("trading_db");
		expect(fromDbName("trading_db" as never)).toBe("trading_db");
	});
	it("should throw for empty string", () => {
		expect(() => DbName.of("")).toThrow(RangeError);
	});
});

describe("CaPem", () => {
	it("should create and convert valid PEM", () => {
		const pem = "-----BEGIN CERTIFICATE-----\ndata\n-----END CERTIFICATE-----";
		expect(CaPem.of(pem)).toBe(pem);
		expect(toCaPem(pem)).toBe(pem);
		expect(fromCaPem(pem as never)).toBe(pem);
	});
	it("should throw for non-PEM string", () => {
		expect(() => CaPem.of("just-data")).toThrow(RangeError);
	});
});

describe("CsrPem", () => {
	it("should create and convert valid PEM", () => {
		const pem =
			"-----BEGIN CERTIFICATE REQUEST-----\ndata\n-----END CERTIFICATE REQUEST-----";
		expect(CsrPem.of(pem)).toBe(pem);
		expect(toCsrPem(pem)).toBe(pem);
		expect(fromCsrPem(pem as never)).toBe(pem);
	});
	it("should throw for non-PEM string", () => {
		expect(() => CsrPem.of("just-data")).toThrow(RangeError);
	});
});

describe("KeyPem", () => {
	it("should create and convert valid PEM", () => {
		const pem = "-----BEGIN PRIVATE KEY-----\ndata\n-----END PRIVATE KEY-----";
		expect(KeyPem.of(pem)).toBe(pem);
		expect(toKeyPem(pem)).toBe(pem);
		expect(fromKeyPem(pem as never)).toBe(pem);
	});
	it("should throw for non-PEM string", () => {
		expect(() => KeyPem.of("just-data")).toThrow(RangeError);
	});
});
