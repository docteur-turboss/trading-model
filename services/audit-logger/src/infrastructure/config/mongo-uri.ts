import { z } from "zod";

/**
 * MongoDB connection string. Not `z.url()`: a replica set lists several
 * hosts (`mongodb://a:27017,b:27017/db?replicaSet=rs0`), which is not a
 * WHATWG URL.
 */
export const MongoUriSchema = z
	.string()
	.regex(
		/^mongodb(\+srv)?:\/\/[^\s/?#]+(\/[^\s?#]*)?(\?\S*)?$/,
		"must be a mongodb:// or mongodb+srv:// connection string"
	);
