import { useCallback, useEffect, useRef, useState } from "react";
import { HttpClientError } from "../api/_request";

interface UseApiResult<TData> {
	data: TData | null;
	loading: boolean;
	error: string | null;
	refetch: () => void;
}

function formatError(err: unknown): string {
	if (err instanceof HttpClientError) {
		return `Error ${err.statusCode}: ${err.message}`;
	}
	return (err as Error).message;
}

async function performFetch<TData>(
	fetcher: () => Promise<TData>,
	mountedRef: { current: boolean },
	setData: (data: TData) => void,
	setLoading: (loading: boolean) => void,
	setError: (error: string | null) => void
): Promise<void> {
	setLoading(true);
	setError(null);
	try {
		const result = await fetcher();
		if (mountedRef.current) {
			setData(result);
		}
	} catch (err) {
		if (mountedRef.current) {
			setError(formatError(err));
		}
	} finally {
		if (mountedRef.current) {
			setLoading(false);
		}
	}
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

	const fetch = useCallback(
		() =>
			performFetch(
				fetcherRef.current,
				mountedRef,
				setData,
				setLoading,
				setError
			),
		[]
	);

	useEffect(() => {
		mountedRef.current = true;
		void fetch();
		return () => {
			mountedRef.current = false;
		};
	}, [fetch, ...deps]);

	return { data, loading, error, refetch: fetch };
}
