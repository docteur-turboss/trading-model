import { describe, expect, it } from "@jest/globals";
import * as wsModule from "../../../src/ws/index";

describe("ws/index", () => {
	it("should export DefaultWsReconnector", () => {
		expect(wsModule.DefaultWsReconnector).toBeDefined();
	});
});
