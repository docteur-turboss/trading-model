import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";

import { App } from "./app";
import "../../i18n";
import { THEME } from "../../shared/theme";
import { reportMetric } from "../telemetry";

onCLS(reportMetric);
onFCP(reportMetric);
onINP(reportMetric);
onLCP(reportMetric);
onTTFB(reportMetric);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ThemeProvider theme={THEME}>
			<CssBaseline />
			<App />
		</ThemeProvider>
	</StrictMode>
);
