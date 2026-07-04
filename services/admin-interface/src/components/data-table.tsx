import {
	Checkbox,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TablePagination,
	TableRow,
	TableSortLabel,
} from "@mui/material";
import { useState } from "react";

export interface Column<TData> {
	id: string;
	label: string;
	render: (row: TData) => React.ReactNode;
	sortable?: boolean;
	width?: string | number;
}

interface DataTableProps<TData> {
	columns: Column<TData>[];
	rows: TData[];
	total?: number;
	page?: number;
	rowsPerPage?: number;
	onPageChange?: (page: number) => void;
	onSelectAll?: (selected: boolean) => void;
	onSelectOne?: (id: string) => void;
	selectedIds?: Set<string>;
	getId: (row: TData) => string;
	selectable?: boolean;
}

export function DataTable<TData>({
	columns,
	rows,
	total = 0,
	page = 0,
	rowsPerPage = 5,
	onPageChange,
	onSelectAll,
	onSelectOne,
	selectedIds,
	getId,
	selectable = false,
}: DataTableProps<TData>) {
	const [orderBy, setOrderBy] = useState<string | null>(null);
	const [orderDir, setOrderDir] = useState<"asc" | "desc">("asc");

	const handleSort = (colId: string) => {
		const isAsc = orderBy === colId && orderDir === "asc";
		setOrderBy(colId);
		setOrderDir(isAsc ? "desc" : "asc");
	};

	const allSelected =
		selectable && rows.length > 0 && selectedIds?.size === rows.length;
	const hasSelection = selectable && (selectedIds?.size ?? 0) > 0;
	const indeterminate = hasSelection && !allSelected;

	return (
		<Paper variant="outlined">
			<TableContainer>
				<Table size="small">
					<TableHead>
						<TableRow>
							{selectable && (
								<TableCell padding="checkbox">
									<Checkbox
										checked={Boolean(allSelected)}
										indeterminate={indeterminate}
										onChange={(event) => onSelectAll?.(event.target.checked)}
									/>
								</TableCell>
							)}
							{columns.map((col) => (
								<TableCell key={col.id} sx={{ width: col.width }}>
									{col.sortable ? (
										<TableSortLabel
											active={orderBy === col.id}
											direction={orderBy === col.id ? orderDir : "asc"}
											onClick={() => handleSort(col.id)}
										>
											{col.label}
										</TableSortLabel>
									) : (
										col.label
									)}
								</TableCell>
							))}
						</TableRow>
					</TableHead>
					<TableBody>
						{rows.map((row) => {
							const id = getId(row);
							const isSelected = selectedIds?.has(id);
							return (
								<TableRow
									key={id}
									hover
									selected={isSelected}
									sx={{ cursor: "pointer" }}
								>
									{selectable && (
										<TableCell padding="checkbox">
											<Checkbox
												checked={Boolean(isSelected)}
												onChange={() => onSelectOne?.(id)}
											/>
										</TableCell>
									)}
									{columns.map((col) => (
										<TableCell key={col.id}>{col.render(row)}</TableCell>
									))}
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</TableContainer>
			{total > 0 && (
				<TablePagination
					component="div"
					count={total}
					page={page}
					onPageChange={(_, pageNum) => onPageChange?.(pageNum)}
					rowsPerPage={rowsPerPage}
					rowsPerPageOptions={[rowsPerPage]}
				/>
			)}
		</Paper>
	);
}
