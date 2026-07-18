import type { PaginationResult } from "../domain/pagination";

export interface MongoRepository<TDoc, TQuery = Record<string, unknown>> {
	insert(doc: TDoc): Promise<void>;
	insertBatch(docs: TDoc[]): Promise<void>;
	findById(id: string): Promise<TDoc | null>;
	ensureIndexes(): Promise<void>;
	query(query: TQuery): Promise<PaginationResult<TDoc>>;
}
