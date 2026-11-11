export enum HTTP_HEADERS {
	X_FORWARDED_FOR = "x-forwarded-for",
	X_FORWARDED_PROTO = "x-forwarded-proto",
	X_REQUEST_ID = "x-request-id",
	X_API_KEY = "x-api-key",
	CORRELATION_ID = "x-correlation-id",
	X_INSTANCE_TOKEN = "x-instance-token",
	X_INSTANCE_ID = "x-instance-id",
	X_SERVICE_NAME = "x-service-name",
	X_TIMESTAMP = "x-timestamp",
	X_SIGNATURE = "x-signature",
	/** API key name api-gateway sets on what it proxies; trusted from api-gateway only (ADR-0059). */
	X_ACTOR = "x-actor",
	CONTENT_TYPE = "Content-Type",
}
