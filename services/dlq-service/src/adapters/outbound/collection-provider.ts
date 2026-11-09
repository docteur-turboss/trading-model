import type { Collection } from "mongodb";

/** Gives the DLQ collection once the connection is up; injected by the container. */
export type CollectionProvider = () => Promise<Collection>;
