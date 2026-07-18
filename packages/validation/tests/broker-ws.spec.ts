import {
	AckStatus,
	WsClientMessageType,
	WsServerMessageType,
} from "../src/contracts/broker-ws.types";

describe("WsClientMessageType", () => {
	it("has expected values", () => {
		expect(WsClientMessageType.Subscribe).toBe("subscribe");
		expect(WsClientMessageType.Unsubscribe).toBe("unsubscribe");
		expect(WsClientMessageType.PublishAsync).toBe("publish_async");
		expect(WsClientMessageType.PublishDirect).toBe("publish_direct");
	});
});

describe("WsServerMessageType", () => {
	it("has expected values", () => {
		expect(WsServerMessageType.Ack).toBe("ack");
		expect(WsServerMessageType.Deliver).toBe("deliver");
		expect(WsServerMessageType.Error).toBe("error");
	});
});

describe("AckStatus", () => {
	it("has expected values", () => {
		expect(AckStatus.Ok).toBe("ok");
		expect(AckStatus.Error).toBe("error");
	});
});
