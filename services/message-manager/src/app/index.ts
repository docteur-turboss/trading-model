import { createBootstrap } from "@trading-model/common/server/bootstrap";
import { bootstrapAddressManager } from "../config/address-manager";
import { createServer } from "./server";
import "../config/env";

let addressManager: ReturnType<typeof bootstrapAddressManager> | null = null;

createBootstrap({
	name: "Message Manager",
	createServer,
	onStart: () => {
		addressManager = bootstrapAddressManager();
	},
	onStop: () => {
		if (addressManager) {
			addressManager.stop();
		}
	},
});
