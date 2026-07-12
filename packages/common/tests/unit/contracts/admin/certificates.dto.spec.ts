import { describe, expect, it } from "@jest/globals";
import { CertificateStatus } from "@trading-model/validation/contracts/admin/certificates.dto";

describe("CertificateStatus", () => {
	it("should have correct enum values", () => {
		expect(CertificateStatus).toBeDefined();
	});
});
