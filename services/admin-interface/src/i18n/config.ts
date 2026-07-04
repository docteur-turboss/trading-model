import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import fr from "./locales/fr.json";

export function detectLanguage(): string {
	return typeof navigator !== "undefined" &&
		navigator.language?.startsWith("fr")
		? "fr"
		: "en";
}

i18n.use(initReactI18next);

i18n.init({
	resources: { en, fr },
	lng: detectLanguage(),
	fallbackLng: "en",
	ns: Object.keys(en),
	defaultNS: "services",
	interpolation: { escapeValue: false },
});

export default i18n;
