import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/shared/styles/globals.css";
import { I18nProvider } from "@/shared/i18n";
import { OnboardingGate } from "@/features/onboarding/OnboardingGate";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <OnboardingGate>
        <App />
      </OnboardingGate>
    </I18nProvider>
  </StrictMode>,
);
