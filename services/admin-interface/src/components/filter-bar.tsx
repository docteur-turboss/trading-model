import { Box, Button, Link, TextField } from "@mui/material";
import type { ReactNode } from "react";

interface FilterBarProps {
	searchPlaceholder?: string;
	searchValue?: string;
	onSearchChange?: (value: string) => void;
	filters?: ReactNode;
	onApply?: () => void;
	onReset?: () => void;
}

function SearchField({
	placeholder,
	value,
	onChange,
}: {
	placeholder: string;
	value?: string;
	onChange?: (value: string) => void;
}) {
	return (
		<TextField
			size="small"
			placeholder={placeholder}
			value={value ?? ""}
			onChange={(event) => onChange?.(event.target.value)}
			sx={{ minWidth: 240 }}
		/>
	);
}

function ApplyButton({ onClick }: { onClick?: () => void }) {
	if (!onClick) {
		return null;
	}
	return (
		<Button variant="contained" size="small" onClick={onClick}>
			Apply
		</Button>
	);
}

function ResetLink({ onClick }: { onClick?: () => void }) {
	if (!onClick) {
		return null;
	}
	return (
		<Link
			component="button"
			variant="body2"
			onClick={onClick}
			sx={{ cursor: "pointer" }}
		>
			Reset
		</Link>
	);
}

/** Search bar with optional filter controls and apply/reset actions. */
export function FilterBar({
	searchPlaceholder = "Search...",
	searchValue,
	onSearchChange,
	filters,
	onApply,
	onReset,
}: FilterBarProps) {
	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "center",
				gap: 2,
				py: 1.5,
				flexWrap: "wrap",
			}}
		>
			<SearchField
				placeholder={searchPlaceholder}
				value={searchValue}
				onChange={onSearchChange}
			/>
			{filters}
			<ApplyButton onClick={onApply} />
			<ResetLink onClick={onReset} />
		</Box>
	);
}
