// Point src/config/db.ts (which reads DB_* when the pool is created) at the
// Testcontainers MySQL.
const uri = new URL(process.env.TEST_MYSQL_URI as string);
process.env.DB_HOST = uri.hostname;
process.env.DB_PORT = uri.port;
process.env.DB_USER = decodeURIComponent(uri.username);
process.env.DB_PASSWORD = decodeURIComponent(uri.password);
process.env.DB_NAME = uri.pathname.slice(1);
