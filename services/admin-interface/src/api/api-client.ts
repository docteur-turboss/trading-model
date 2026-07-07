import { auditApi } from "./audit-api";
import { cacheApi } from "./cache-api";
import { certificateApi } from "./certificate-api";
import { discoveryApi } from "./discovery-api";
import { dlqApi } from "./dlq-api";
import { jobsApi } from "./jobs-api";
import { scraperApi } from "./scraper-api";
import { setAdminToken } from "./_request";
import { trainingApi } from "./training-api";

export { setAdminToken };

export const API_CLIENT = {
	...discoveryApi,
	...auditApi,
	...jobsApi,
	...dlqApi,
	...trainingApi,
	...cacheApi,
	...scraperApi,
	...certificateApi,
};
