import { createBootstrap } from "@trading-model/common/server/bootstrap";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { createServer } from "./server";
import "../config/env";

let addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> | null = null;

createBootstrap({
	name: "Financial Scraper",
	createServer,
	onStart: () => {
		addressManager = BOOTSTRAP_ADDRESS_MANAGER();
	},
	onStop: () => {
		if (addressManager) {
			addressManager.stop();
		}
	},
});
