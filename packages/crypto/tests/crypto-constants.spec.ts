import { CryptoAlg } from "../src/constants/crypto-constants";

describe("CryptoAlg", () => {
	it("should have expected values", () => {
		expect(CryptoAlg.SHA256).toBe("sha256");
		expect(CryptoAlg.HEX).toBe("hex");
	});
});
