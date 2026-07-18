import * as primitivesPkg from "@trading-model/common/domain/primitives";

describe("debug import", () => {
	it("should have toNonce from package import", () => {
		console.log(
			"PKG import - typeof toNonce:",
			typeof (primitivesPkg as any).toNonce
		);
		console.log("PKG import - has toNonce:", "toNonce" in primitivesPkg);
		console.log("PKG import - has CertPem:", "CertPem" in primitivesPkg);
		console.log("PKG import - has Nonce:", "Nonce" in primitivesPkg);
		expect(typeof (primitivesPkg as any).toNonce).toBe("function");
	});
	it("should have toNonce from direct import", () => {
		console.log(
			"DIRECT import - typeof toNonce:",
			typeof (primitivesPkg as any).toNonce
		);
		console.log("DIRECT import - has toNonce:", "toNonce" in primitivesPkg);
		expect(typeof (primitivesPkg as any).toNonce).toBe("function");
	});
});
