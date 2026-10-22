import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";

/** HTTP client used by the readiness probe to reach the discovery service. */
export const discoveryClient = new HttpClient();
