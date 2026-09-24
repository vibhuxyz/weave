import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/shared/styles/globals.css";
import { I18nProvider } from "@/shared/i18n";
import { OnboardingGate } from "@/features/onboarding";
import { App } from "./App";
import { AppErrorBoundary } from "./AppErrorBoundary";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <AppErrorBoundary>
        <OnboardingGate>
          <App />
        </OnboardingGate>
      </AppErrorBoundary>
    </I18nProvider>
  </StrictMode>,
);
