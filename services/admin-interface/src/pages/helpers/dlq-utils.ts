import type { MessageId } from "@trading-model/common/domain/primitives";
import { useState } from "react";

export function useDlqSelection(
	data: { messages: { messageId: MessageId }[] } | null | undefined
) {
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	const handleSelectAll = (checked: boolean) => {
		setSelectedIds(
			checked
				? new Set((data?.messages ?? []).map((msg) => msg.messageId))
				: new Set()
		);
	};

	const handleSelectOne = (id: string) => {
		const next = new Set(selectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		setSelectedIds(next);
	};

	return { selectedIds, handleSelectAll, handleSelectOne };
}
