import type { Components } from "@mui/material/styles";
import { createTheme } from "@mui/material/styles";

function muiOverride(
	name: string,
	config: Components[keyof Components]
): Components {
	return { [name]: config } as Components;
}

const MUI_COMPONENTS: Components = {
	...muiOverride("MuiCard", {
		styleOverrides: { root: { boxShadow: "0 1px 3px rgba(0,0,0,0.08)" } },
	}),
	...muiOverride("MuiTableHead", {
		styleOverrides: {
			root: {
				"& .MuiTableCell-head": {
					fontWeight: 600,
					backgroundColor: "#fafafa",
					color: "#616161",
					fontSize: "0.75rem",
					textTransform: "uppercase",
				},
			},
		},
	}),
	...muiOverride("MuiChip", {
		styleOverrides: {
			root: { fontWeight: 600, fontSize: "0.7rem" },
		},
	}),
};

export const THEME = createTheme({
	palette: {
		primary: { main: "#1976d2" },
		secondary: { main: "#9e9e9e" },
		success: { main: "#2e7d32" },
		warning: { main: "#ed6c02" },
		error: { main: "#d32f2f" },
		info: { main: "#0288d1" },
		background: { default: "#f5f5f5", paper: "#ffffff" },
	},
	typography: {
		fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
		h4: { fontWeight: 600, fontSize: "1.5rem" },
		h5: { fontWeight: 600, fontSize: "1.25rem" },
		h6: { fontWeight: 600, fontSize: "1rem" },
		subtitle2: { fontSize: "0.75rem", color: "#757575", fontWeight: 500 },
	},
	shape: { borderRadius: 8 },
	components: MUI_COMPONENTS,
});
