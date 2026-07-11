import { describe, expect, it } from "@jest/globals";
import { CertificateStatus } from "../../../../src/contracts/admin/certificates.dto";

describe("CertificateStatus", () => {
	it("should have correct enum values", () => {
		expect(CertificateStatus).toBeDefined();
	});
});
