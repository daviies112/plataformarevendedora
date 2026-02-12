/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  CRITICAL PERFORMANCE FILE - DO NOT MODIFY WITHOUT READING THIS  ⚠️   ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  This file implements EARLY ROUTE DETECTION for public pages.             ║
 * ║  Without this, public pages (forms, meetings, signatures) take 15+ sec.   ║
 * ║                                                                           ║
 * ║  🔴 NEVER:                                                                 ║
 * ║  - Import heavy dependencies here (TanStack Query, shadcn, lucide, etc)   ║
 * ║  - Remove the route detection logic                                       ║
 * ║  - Move CSS import above the route detection                              ║
 * ║  - Add React context providers before route detection                     ║
 * ║                                                                           ║
 * ║  🟢 ARCHITECTURE:                                                          ║
 * ║  - Public routes → Load ultra-light Public*App (10 modules)               ║
 * ║  - Private routes → Load full App.tsx (80+ modules)                       ║
 * ║                                                                           ║
 * ║  📖 Full documentation: docs/PUBLIC_FORM_PERFORMANCE_FIX.md               ║
 * ║  💰 Cost to discover this fix: $30+ in debugging time                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
import { createRoot } from "react-dom/client";

// Renderização normal do app completo
import "./index.css";
// import("./App").then(({ default: App }) => { // Dynamic import causing issues? No, it should be fine.
import App from "./App";
import { initializeColorScheme } from "./lib/colorScheme";

const path = window.location.pathname;

initializeColorScheme();

createRoot(document.getElementById("root")!).render(<App />);

const isPrivateRoute =
  path !== '/' &&
  path !== '/login' &&
  path !== '/reseller-login' &&
  !path.startsWith('/loja/') &&
  !path.startsWith('/checkout/');

if (isPrivateRoute) {
  setTimeout(() => {
    import("./lib/sentry").then(({ initializeSentry }) => {
      initializeSentry().catch(console.error);
    });
  }, 3000);
}
