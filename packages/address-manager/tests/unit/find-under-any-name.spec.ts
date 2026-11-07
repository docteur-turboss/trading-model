import { describe, expect, it, jest } from "@jest/globals";
import { findUnderAnyName } from "../../src/application/find-under-any-name";

const registry = (registeredAs: string) =>
	jest.fn(async (name: string) => {
		if (name !== registeredAs) {
			throw new Error(`no ${name}`);
		}
		return name;
	});

describe("findUnderAnyName", () => {
	it("old client finds a service registered under the canonical name", async () => {
		await expect(
			findUnderAnyName(registry("message-manager"), "message-delivery-service")
		).resolves.toBe("message-manager");
	});

	it("new client finds a service still registered under the old name", async () => {
		await expect(
			findUnderAnyName(registry("message-delivery-service"), "message-manager")
		).resolves.toBe("message-delivery-service");
	});

	it("throws when no name answers", async () => {
		await expect(
			findUnderAnyName(registry("other"), "message-manager")
		).rejects.toThrow("no message-manager");
	});
});
