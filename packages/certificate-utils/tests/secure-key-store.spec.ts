import { describe, expect, it } from "@jest/globals";
import { SecureKeyStore } from "../src/vault/secure-key-store";

describe("SecureKeyStore", () => {
	it("should store and read a PEM string", () => {
		const pem = "-----BEGIN PRIVATE KEY-----\nZm9v\n-----END PRIVATE KEY-----";
		const store = new SecureKeyStore(pem);

		expect(store.read()).toBe(pem);
	});

	it("should expose raw buffer", () => {
		const pem = "test-key-material";
		const store = new SecureKeyStore(pem);

		expect(store.raw).toBeInstanceOf(Buffer);
		expect(store.raw.toString("utf8")).toBe(pem);
	});

	it("should zero buffer on destroy", () => {
		const pem = "sensitive-key-data";
		const store = new SecureKeyStore(pem);

		const rawBefore = Buffer.from(store.raw);
		store.destroy();

		const rawAfter = store.raw;
		expect(rawAfter.every((b) => b === 0)).toBe(true);
		expect(rawBefore.equals(rawAfter)).toBe(false);
	});

	it("should throw on read after destroy", () => {
		const pem = "test";
		const store = new SecureKeyStore(pem);

		store.destroy();

		expect(() => store.read()).toThrow("SecureKeyStore has been destroyed");
	});

	it("should throw on toJSON", () => {
		const store = new SecureKeyStore("test");

		expect(() => store.toJSON()).toThrow(
			"SecureKeyStore cannot be serialized to JSON"
		);
	});

	it("should throw on toString", () => {
		const store = new SecureKeyStore("test");

		expect(() => store.toString()).toThrow(
			"SecureKeyStore cannot be converted to string directly"
		);
	});

	it("should have correct Symbol.toStringTag", () => {
		const store = new SecureKeyStore("test");

		expect(store[Symbol.toStringTag]).toBe("SecureKeyStore");
	});
});
