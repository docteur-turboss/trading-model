import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import "../../i18n";
import { THEME } from "../../shared/theme";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ThemeProvider theme={THEME}>
			<CssBaseline />
			<App />
		</ThemeProvider>
	</StrictMode>
);
