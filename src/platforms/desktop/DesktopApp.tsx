import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import DesktopLayout from "./layouts/DesktopLayout";
import { ResellerContentWrapper } from "./layouts/ResellerContentWrapper";
import { RootRedirect } from "@/components/RootRedirect";

// Pages
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";

// Reseller Components
import { CompanyProvider } from "@/features/revendedora/contexts/CompanyContext";
import ResellerDashboard from "@/features/revendedora/pages/reseller/Dashboard";
import ResellerStore from "@/features/revendedora/pages/reseller/Store";
import ResellerSales from "@/features/revendedora/pages/reseller/Sales";
import ResellerFinancial from "@/features/revendedora/pages/reseller/Financial";
import ResellerSettings from "@/features/revendedora/pages/reseller/Settings";
import ResellerGamification from "@/features/revendedora/pages/reseller/Gamification";

/**
 * Desktop App - Versão limpa para Revendedora (App do Revendedor)
 */
const DesktopApp = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RootRedirect />} />

      {/* Dashboard */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DesktopLayout>
              <CompanyProvider>
                <ResellerContentWrapper>
                  <ResellerDashboard />
                </ResellerContentWrapper>
              </CompanyProvider>
            </DesktopLayout>
          </ProtectedRoute>
        }
      />

      {/* Catálogo / Loja */}
      <Route
        path="/catalogo"
        element={
          <ProtectedRoute>
            <DesktopLayout>
              <CompanyProvider>
                <ResellerContentWrapper>
                  <ResellerStore />
                </ResellerContentWrapper>
              </CompanyProvider>
            </DesktopLayout>
          </ProtectedRoute>
        }
      />

      {/* Minhas Vendas */}
      <Route
        path="/vendas"
        element={
          <ProtectedRoute>
            <DesktopLayout>
              <CompanyProvider>
                <ResellerContentWrapper>
                  <ResellerSales />
                </ResellerContentWrapper>
              </CompanyProvider>
            </DesktopLayout>
          </ProtectedRoute>
        }
      />

      {/* Financeiro */}
      <Route
        path="/financeiro"
        element={
          <ProtectedRoute>
            <DesktopLayout>
              <CompanyProvider>
                <ResellerContentWrapper>
                  <ResellerFinancial />
                </ResellerContentWrapper>
              </CompanyProvider>
            </DesktopLayout>
          </ProtectedRoute>
        }
      />

      {/* Gamificação */}
      <Route
        path="/conquistas"
        element={
          <ProtectedRoute>
            <DesktopLayout>
              <CompanyProvider>
                <ResellerContentWrapper>
                  <ResellerGamification />
                </ResellerContentWrapper>
              </CompanyProvider>
            </DesktopLayout>
          </ProtectedRoute>
        }
      />

      {/* Configurações */}
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <DesktopLayout>
              <CompanyProvider>
                <ResellerContentWrapper>
                  <ResellerSettings />
                </ResellerContentWrapper>
              </CompanyProvider>
            </DesktopLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/configurações"
        element={<Navigate to="/settings" replace />}
      />

      {/* Catch all */}
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <DesktopLayout>
              <NotFoundPage />
            </DesktopLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

export default DesktopApp;
