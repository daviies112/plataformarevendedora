import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import MobileLayout from "./layouts/MobileLayout";
import { ResellerContentWrapper } from "@/platforms/desktop/layouts/ResellerContentWrapper"; // Import from desktop layout
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
 * Mobile App - Versão limpa para Revendedora (App do Revendedor)
 */
const MobileApp = () => {
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
            <MobileLayout>
              <CompanyProvider>
                <ResellerContentWrapper>
                  <ResellerDashboard />
                </ResellerContentWrapper>
              </CompanyProvider>
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      {/* Catálogo / Loja */}
      <Route
        path="/catalogo"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <CompanyProvider>
                <ResellerContentWrapper>
                  <ResellerStore />
                </ResellerContentWrapper>
              </CompanyProvider>
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      {/* Minhas Vendas */}
      <Route
        path="/vendas"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <CompanyProvider>
                <ResellerContentWrapper>
                  <ResellerSales />
                </ResellerContentWrapper>
              </CompanyProvider>
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      {/* Financeiro */}
      <Route
        path="/financeiro"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <CompanyProvider>
                <ResellerContentWrapper>
                  <ResellerFinancial />
                </ResellerContentWrapper>
              </CompanyProvider>
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      {/* Gamificação */}
      <Route
        path="/conquistas"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <CompanyProvider>
                <ResellerContentWrapper>
                  <ResellerGamification />
                </ResellerContentWrapper>
              </CompanyProvider>
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      {/* Configurações */}
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <CompanyProvider>
                <ResellerContentWrapper>
                  <ResellerSettings />
                </ResellerContentWrapper>
              </CompanyProvider>
            </MobileLayout>
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
            <MobileLayout>
              <NotFoundPage />
            </MobileLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

export default MobileApp;
