import { CryptoAlg } from "../src/domain/constants/crypto-constants";

describe("CryptoAlg", () => {
	it("should have expected values", () => {
		expect(CryptoAlg.SHA256).toBe("sha256");
		expect(CryptoAlg.UTF8).toBe("utf8");
		expect(CryptoAlg.BASE64URL).toBe("base64url");
		expect(CryptoAlg.HEX).toBe("hex");
	});
});
