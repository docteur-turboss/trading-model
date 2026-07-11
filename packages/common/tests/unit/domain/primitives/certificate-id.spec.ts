import { describe, expect, it } from "@jest/globals";
import {
	CertificateId,
	CommonName,
	fromCertificateId,
	fromCommonName,
	toCertificateId,
	toCommonName,
} from "../../../../src/domain/primitives/certificate-id";

describe("CertificateId", () => {
	it("should create a valid certificate ID", () => {
		expect(CertificateId.of("abc123")).toBe("abc123");
	});

	it("should throw for empty string", () => {
		expect(() => CertificateId.of("")).toThrow(RangeError);
	});

	it("should throw for non-string", () => {
		expect(() => CertificateId.of(123 as never)).toThrow(RangeError);
	});

	it("should convert via toCertificateId and fromCertificateId", () => {
		expect(toCertificateId("abc")).toBe("abc");
		expect(fromCertificateId("abc" as never)).toBe("abc");
	});
});

describe("CommonName", () => {
	it("should create a valid common name", () => {
		expect(CommonName.of("example.com")).toBe("example.com");
	});

	it("should throw for empty string", () => {
		expect(() => CommonName.of("")).toThrow(RangeError);
	});

	it("should convert via toCommonName and fromCommonName", () => {
		expect(toCommonName("test")).toBe("test");
		expect(fromCommonName("test" as never)).toBe("test");
	});
});
