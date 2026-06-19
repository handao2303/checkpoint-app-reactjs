import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext.tsx";
import { UserProfileProvider } from "./context/UserProfileProvider.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { RouteTracker } from "./components/RouteTracker.tsx";
import { trackError } from "./lib/observability.ts";
import App from "./App.tsx";
import "./index.css";
import "./lib/i18n";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

if (
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
) {
  document.documentElement.classList.add("pwa-standalone");
}

window.addEventListener("error", (event) => {
  trackError(event.error ?? event.message, { feature: "window", action: "uncaught_error" }, "fatal");
});

window.addEventListener("unhandledrejection", (event) => {
  trackError(event.reason, { feature: "window", action: "unhandled_rejection" });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <UserProfileProvider>
              <RouteTracker />
              <App />
            </UserProfileProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
