import type { DbName, DbPassword, DbUser, Hostname, Port } from "./primitives";

export interface DbConnectionConfig {
	host: Hostname;
	port: Port;
	user: DbUser;
	password: DbPassword;
	database: DbName;
	/**
	 * TLS options of the driver. Absent: plain connection (compose, dev).
	 * Present: the server certificate is verified against `ca`, host name
	 * included (issue #767, ADR-0060).
	 */
	ssl?: { ca: string };
}
