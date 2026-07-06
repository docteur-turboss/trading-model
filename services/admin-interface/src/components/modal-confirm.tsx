import CloseIcon from "@mui/icons-material/Close";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	List,
	ListItem,
	ListItemText,
	Typography,
} from "@mui/material";

interface ModalConfirmProps {
	open: boolean;
	title: string;
	description: string;
	impactItems?: string[];
	confirmLabel?: string;
	confirmColor?: "error" | "primary" | "warning";
	onConfirm: () => void;
	onCancel: () => void;
	extraContent?: React.ReactNode;
}

function ConfirmDialogTitle({
	title,
	onCancel,
}: {
	title: string;
	onCancel: () => void;
}) {
	return (
		<DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
			<WarningAmberIcon color="error" />
			<Typography variant="h6" fontWeight={600}>
				{title}
			</Typography>
			<IconButton onClick={onCancel} sx={{ ml: "auto" }}>
				<CloseIcon />
			</IconButton>
		</DialogTitle>
	);
}

function ImpactList({ impactItems }: { impactItems: string[] }) {
	if (!impactItems || impactItems.length === 0) {
		return null;
	}
	return (
		<Alert severity="error" sx={{ mb: 2 }}>
			<Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
				Expected Impact:
			</Typography>
			<List dense disablePadding>
				{impactItems.map((item) => (
					<ListItem key={item} sx={{ py: 0.25, px: 0 }}>
						<ListItemText
							primary={item}
							primaryTypographyProps={{ variant: "body2" }}
						/>
					</ListItem>
				))}
			</List>
		</Alert>
	);
}

function ConfirmDialogContent({
	description,
	impactItems,
	extraContent,
}: {
	description: string;
	impactItems?: string[];
	extraContent?: React.ReactNode;
}) {
	return (
		<DialogContent>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				{description}
			</Typography>
			<ImpactList impactItems={impactItems ?? []} />
			{extraContent}
		</DialogContent>
	);
}

function ConfirmDialogActions({
	confirmLabel,
	confirmColor,
	onConfirm,
	onCancel,
}: {
	confirmLabel: string;
	confirmColor: "error" | "primary" | "warning";
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<DialogActions sx={{ padding: 2, pt: 0 }}>
			<Button variant="outlined" onClick={onCancel}>
				Cancel
			</Button>
			<Button variant="contained" color={confirmColor} onClick={onConfirm}>
				{confirmLabel}
			</Button>
		</DialogActions>
	);
}

/** Confirmation dialog with impact list and confirm/cancel actions. */
export function ModalConfirm({
	open,
	title,
	description,
	impactItems,
	confirmLabel = "Confirm",
	confirmColor = "error",
	onConfirm,
	onCancel,
	extraContent,
}: ModalConfirmProps) {
	return (
		<Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
			<ConfirmDialogTitle title={title} onCancel={onCancel} />
			<ConfirmDialogContent
				description={description}
				impactItems={impactItems}
				extraContent={extraContent}
			/>
			<ConfirmDialogActions
				confirmLabel={confirmLabel}
				confirmColor={confirmColor}
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>
		</Dialog>
	);
}
