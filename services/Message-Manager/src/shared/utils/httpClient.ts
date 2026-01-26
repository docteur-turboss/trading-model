import { HttpClient } from "cash-lib/config/httpClient";
import { env } from "config/env";

export default new HttpClient({
    ca: env.TLS_CA_PATH,
    cert: env.TLS_CERT_PATH,
    key: env.TLS_KEY_PATH
})