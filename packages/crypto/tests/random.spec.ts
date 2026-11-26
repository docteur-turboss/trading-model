import { sha256Hex } from "../src/node-crypto";

describe("sha256Hex", () => {
	it("should return the hex SHA-256 digest", () => {
		expect(sha256Hex("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
		);
	});
});
