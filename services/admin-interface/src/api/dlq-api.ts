import type { DlqMessageList } from "../types/dtos";
import { request } from "./_request";

export const dlqApi = {
	getDlqMessages: () => request<DlqMessageList>("GET", "/messages/dlq"),
	purgeDlq: () => request<void>("DELETE", "/messages/dlq"),
	retryDlqMessage: (id: string) =>
		request<void>("POST", `/messages/dlq/${id}/retry`),
};
