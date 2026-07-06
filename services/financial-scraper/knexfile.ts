import type { Knex } from "knex";

import { createDbConfigFromEnv } from "@trading-model/common/domain/db-connection-config";

const CONFIG: { [key: string]: Knex.Config } = {
	development: {
		client: "mysql2",
		connection: createDbConfigFromEnv(),
		migrations: {
			directory: "./migrations",
			extension: "ts",
		},
	},
};

export default CONFIG;
