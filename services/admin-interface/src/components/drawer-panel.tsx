import CloseIcon from "@mui/icons-material/Close";
import { Box, Drawer, IconButton, Tab, Tabs, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface DrawerPanelProps {
	open: boolean;
	title: string;
	subtitle?: string;
	onClose: () => void;
	tabs?: { label: string; content: ReactNode }[];
	activeTab?: number;
	onTabChange?: (tab: number) => void;
	actions?: ReactNode;
}

function DrawerHeader({
	title,
	subtitle,
	onClose,
}: {
	title: string;
	subtitle?: string;
	onClose: () => void;
}) {
	return (
		<Box sx={{ padding: 2, borderBottom: 1, borderColor: "divider" }}>
			<Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
				<Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1 }}>
					{title}
				</Typography>
				<IconButton onClick={onClose} size="small">
					<CloseIcon />
				</IconButton>
			</Box>
			{subtitle && (
				<Typography variant="body2" color="text.secondary">
					{subtitle}
				</Typography>
			)}
		</Box>
	);
}

function DrawerTabs({
	tabs,
	activeTab,
	onTabChange,
}: {
	tabs?: { label: string; content: ReactNode }[];
	activeTab: number;
	onTabChange?: (tab: number) => void;
}) {
	if (!tabs || tabs.length === 0) {
		return null;
	}
	return (
		<Tabs
			value={activeTab}
			onChange={(_, newTab) => onTabChange?.(newTab)}
			sx={{ borderBottom: 1, borderColor: "divider", px: 2 }}
		>
			{tabs.map((tab) => (
				<Tab key={tab.label} label={tab.label} />
			))}
		</Tabs>
	);
}

function DrawerContent({
	tabs,
	activeTab,
}: {
	tabs: { label: string; content: ReactNode }[] | undefined;
	activeTab: number;
}) {
	return (
		<Box sx={{ flexGrow: 1, overflow: "auto", padding: 2 }}>
			{tabs ? tabs[activeTab]?.content : null}
		</Box>
	);
}

function DrawerActions({ actions }: { actions?: ReactNode }) {
	if (!actions) {
		return null;
	}
	return (
		<Box
			sx={{
				padding: 2,
				borderTop: 1,
				borderColor: "divider",
				display: "flex",
				gap: 1,
			}}
		>
			{actions}
		</Box>
	);
}

/** Right-side drawer panel with optional tabs and action buttons. */
export function DrawerPanel({
	open,
	title,
	subtitle,
	onClose,
	tabs,
	activeTab = 0,
	onTabChange,
	actions,
}: DrawerPanelProps) {
	return (
		<Drawer
			anchor="right"
			open={open}
			onClose={onClose}
			PaperProps={{ sx: { width: "40%", minWidth: 400, maxWidth: 600 } }}
		>
			<Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
				<DrawerHeader title={title} subtitle={subtitle} onClose={onClose} />
				<DrawerTabs
					tabs={tabs}
					activeTab={activeTab}
					onTabChange={onTabChange}
				/>
				<DrawerContent tabs={tabs} activeTab={activeTab} />
				<DrawerActions actions={actions} />
			</Box>
		</Drawer>
	);
}
