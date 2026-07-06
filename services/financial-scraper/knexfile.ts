import { createDbConfigFromEnv } from "@trading-model/common/domain/db-connection-config";
import type { Knex } from "knex";

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
