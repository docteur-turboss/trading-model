import type { DbName, DbPassword, DbUser, Hostname, Port } from "./primitives";

export interface DbConnectionConfig {
	host: Hostname;
	port: Port;
	user: DbUser;
	password: DbPassword;
	database: DbName;
}
