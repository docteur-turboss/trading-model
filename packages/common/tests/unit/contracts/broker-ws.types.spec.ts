import { describe, expect, it } from "@jest/globals";
import {
	WsClientMessageType,
	WsServerMessageType,
} from "../../../src/contracts/broker-ws.types";

describe("WsClientMessageType", () => {
	it("should have expected values", () => {
		expect(WsClientMessageType).toBeDefined();
	});
});

describe("WsServerMessageType", () => {
	it("should have expected values", () => {
		expect(WsServerMessageType).toBeDefined();
	});
});
