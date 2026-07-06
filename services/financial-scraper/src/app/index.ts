import { createBootstrap } from "@trading-model/common/server/bootstrap";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { createServer } from "./server";
import "../config/env";

const NULL_ADDRESS_MANAGER = { stop() {} };

let addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> =
	NULL_ADDRESS_MANAGER as ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>;

createBootstrap({
	name: "Financial Scraper",
	createServer,
	onStart: () => {
		addressManager = BOOTSTRAP_ADDRESS_MANAGER();
	},
	onStop: () => {
		addressManager.stop();
	},
});
