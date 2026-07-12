import { createBootstrap } from "@trading-model/server-utils/server/bootstrap";

import { createServer } from "./server";

createBootstrap({
	name: "ApiGateway",
	createServer,
});
