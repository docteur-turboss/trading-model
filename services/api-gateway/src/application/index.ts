import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";

import { createServer } from "./server";

createBootstrap({
	name: "ApiGateway",
	createServer,
});
