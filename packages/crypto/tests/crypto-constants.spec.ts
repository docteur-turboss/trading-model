import { CryptoAlg } from "../src/crypto/crypto-constants";

describe("CryptoAlg", () => {
	it("should have expected values", () => {
		expect(CryptoAlg.SHA256).toBe("sha256");
		expect(CryptoAlg.SHA512).toBe("sha512");
		expect(CryptoAlg.RSA_SHA256).toBe("RSA-SHA256");
		expect(CryptoAlg.UTF8).toBe("utf8");
		expect(CryptoAlg.BASE64URL).toBe("base64url");
		expect(CryptoAlg.HEX).toBe("hex");
		expect(CryptoAlg.AES_256_GCM).toBe("aes-256-gcm");
	});
});
