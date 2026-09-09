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

interface DataTableHeadProps<TData> {
	columns: Column<TData>[];
	selectable: boolean;
	allSelected: boolean;
	indeterminate: boolean;
	onSelectAll?: (selected: boolean) => void;
	orderBy: string | null;
	orderDir: "asc" | "desc";
	onSort: (colId: string) => void;
}

function DataTableHead<TData>({
	columns,
	selectable,
	allSelected,
	indeterminate,
	onSelectAll,
	orderBy,
	orderDir,
	onSort,
}: DataTableHeadProps<TData>) {
	return (
		<TableHead>
			<TableRow>
				{selectable && (
					<TableCell padding="checkbox">
						<Checkbox
							checked={allSelected}
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
								onClick={() => onSort(col.id)}
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
	);
}

interface DataTableRowProps<TData> {
	row: TData;
	columns: Column<TData>[];
	selectable: boolean;
	selectedIds?: Set<string>;
	getId: (row: TData) => string;
	onSelectOne?: (id: string) => void;
}

function DataTableRow<TData>({
	row,
	columns,
	selectable,
	selectedIds,
	getId,
	onSelectOne,
}: DataTableRowProps<TData>) {
	const id = getId(row);
	const isSelected = selectedIds?.has(id);
	return (
		<TableRow hover selected={isSelected} sx={{ cursor: "pointer" }}>
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
}

interface DataTablePaginationProps {
	total: number;
	page: number;
	rowsPerPage: number;
	onPageChange?: (page: number) => void;
}

function DataTablePagination({
	total,
	page,
	rowsPerPage,
	onPageChange,
}: DataTablePaginationProps) {
	return (
		<TablePagination
			component="div"
			count={total}
			page={page}
			onPageChange={(_, pageNum) => onPageChange?.(pageNum)}
			rowsPerPage={rowsPerPage}
			rowsPerPageOptions={[rowsPerPage]}
		/>
	);
}

interface DataTableBodyProps<TData> {
	columns: Column<TData>[];
	rows: TData[];
	selectable: boolean;
	selectedIds?: Set<string>;
	getId: (row: TData) => string;
	onSelectOne?: (id: string) => void;
	allSelected: boolean;
	indeterminate: boolean;
	onSelectAll?: (selected: boolean) => void;
	orderBy: string | null;
	orderDir: "asc" | "desc";
	onSort: (colId: string) => void;
}

function DataTableBody<TData>({
	columns,
	rows,
	selectable,
	selectedIds,
	getId,
	onSelectOne,
	allSelected,
	indeterminate,
	onSelectAll,
	orderBy,
	orderDir,
	onSort,
}: DataTableBodyProps<TData>) {
	return (
		<Table size="small">
			<DataTableHead
				columns={columns}
				selectable={selectable}
				allSelected={allSelected}
				indeterminate={indeterminate}
				onSelectAll={onSelectAll}
				orderBy={orderBy}
				orderDir={orderDir}
				onSort={onSort}
			/>
			<TableBody>
				{rows.map((row) => (
					<DataTableRow
						key={getId(row)}
						row={row}
						columns={columns}
						selectable={selectable}
						selectedIds={selectedIds}
						getId={getId}
						onSelectOne={onSelectOne}
					/>
				))}
			</TableBody>
		</Table>
	);
}

function useSortState(): {
	orderBy: string | null;
	orderDir: "asc" | "desc";
	handleSort: (colId: string) => void;
} {
	const [orderBy, setOrderBy] = useState<string | null>(null);
	const [orderDir, setOrderDir] = useState<"asc" | "desc">("asc");
	const handleSort = (colId: string) => {
		const isAsc = orderBy === colId && orderDir === "asc";
		setOrderBy(colId);
		setOrderDir(isAsc ? "desc" : "asc");
	};
	return { orderBy, orderDir, handleSort };
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
	const { orderBy, orderDir, handleSort } = useSortState();

	const allSelected =
		selectable && rows.length > 0 && selectedIds?.size === rows.length;
	const hasSelection = selectable && (selectedIds?.size ?? 0) > 0;
	const indeterminate = hasSelection && !allSelected;

	return (
		<Paper variant="outlined">
			<TableContainer>
				<DataTableBody
					columns={columns}
					rows={rows}
					selectable={selectable}
					selectedIds={selectedIds}
					getId={getId}
					onSelectOne={onSelectOne}
					allSelected={allSelected}
					indeterminate={indeterminate}
					onSelectAll={onSelectAll}
					orderBy={orderBy}
					orderDir={orderDir}
					onSort={handleSort}
				/>
			</TableContainer>
			{total > 0 && (
				<DataTablePagination
					total={total}
					page={page}
					rowsPerPage={rowsPerPage}
					onPageChange={onPageChange}
				/>
			)}
		</Paper>
	);
}
