import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../types/dtos";

interface UseApiResult<TData> {
	data: TData | null;
	loading: boolean;
	error: string | null;
	refetch: () => void;
}

export function useApi<TData>(
	fetcher: () => Promise<TData>,
	deps: unknown[] = []
): UseApiResult<TData> {
	const [data, setData] = useState<TData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const mountedRef = useRef(true);
	const fetcherRef = useRef(fetcher);
	fetcherRef.current = fetcher;

	const fetch = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await fetcherRef.current();
			if (mountedRef.current) {
				setData(result);
			}
		} catch (err) {
			if (mountedRef.current) {
				if (err instanceof ApiError) {
					setError(`Error ${err.statusCode}: ${err.message}`);
				} else {
					setError((err as Error).message);
				}
			}
		} finally {
			if (mountedRef.current) {
				setLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		void fetch();
		return () => {
			mountedRef.current = false;
		};
	}, [fetch, ...deps]);

	return { data, loading, error, refetch: fetch };
}
