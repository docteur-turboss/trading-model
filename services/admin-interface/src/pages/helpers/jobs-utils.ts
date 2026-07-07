import type { Column } from "../../components/data-table";
import type { JobEntry } from "../../types/dtos";

export function createJobColumns(): Column<JobEntry>[] {
	return [
		{ id: "id", label: "Job ID", render: (row) => row.id },
		{ id: "type", label: "Type", render: (row) => row.type },
		{
			id: "priority",
			label: "Priority",
			render: (row) => row.priority,
		},
		{
			id: "status",
			label: "Status",
			render: (row) => row.status,
		},
		{
			id: "worker",
			label: "Worker",
			render: (row) => row.worker ?? "Unassigned",
		},
	];
}
