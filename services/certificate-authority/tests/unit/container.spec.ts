import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockClose = jest.fn();

jest.mock("../../src/persistence/mongo-manager", () => ({
	MONGO_MANAGER: {
		close: mockClose,
	},
}));

import { Container } from "../../src/app/container";

describe("Container", () => {
	let container: Container;

	beforeEach(() => {
		jest.clearAllMocks();
		container = new Container(
			{} as any,
			{} as any,
			{} as any,
			{} as any,
			{} as any
		);
	});

	it("should construct with provided dependencies", () => {
		const ca = { name: "ca" } as any;
		const certStore = { name: "certStore" } as any;
		const crlStore = { name: "crlStore" } as any;
		const caStore = { name: "caStore" } as any;
		const distributor = { name: "distributor" } as any;

		const c = new Container(ca, certStore, crlStore, caStore, distributor);
		expect(c.ca).toBe(ca);
		expect(c.certificateStore).toBe(certStore);
		expect(c.crlStore).toBe(crlStore);
		expect(c.caStore).toBe(caStore);
		expect(c.distributor).toBe(distributor);
	});

	it("should call MONGO_MANAGER.close on disconnectAll", async () => {
		await container.disconnectAll();
		expect(mockClose).toHaveBeenCalled();
	});
});
