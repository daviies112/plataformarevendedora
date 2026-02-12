import { Routes, Route, Navigate } from "react-router-dom";
import { CompanyProvider } from "@/features/revendedora/contexts/CompanyContext";

import Login from "@/features/revendedora/pages/Login";
import NotFound from "@/features/revendedora/pages/NotFound";
import Demo from "@/features/revendedora/pages/Demo";

import { ResellerLayout } from "@/features/revendedora/layouts/ResellerLayout";

import Checkout from "@/features/revendedora/pages/public/Checkout";
import Storefront from "@/features/revendedora/pages/public/Storefront";
import OrderSuccess from "@/features/revendedora/pages/public/OrderSuccess";
import TrackOrder from "@/features/revendedora/pages/public/TrackOrder";
import ProductView from "@/features/revendedora/pages/public/ProductView";

import ResellerDashboard from "@/features/revendedora/pages/reseller/Dashboard";
import ResellerTeam from "@/features/revendedora/pages/reseller/Team";
import ResellerSales from "@/features/revendedora/pages/reseller/Sales";
import ResellerFinancial from "@/features/revendedora/pages/reseller/Financial";
import ResellerStore from "@/features/revendedora/pages/reseller/Store";
import ResellerPaymentPix from "@/features/revendedora/pages/reseller/PaymentPix";
import ResellerPaymentCard from "@/features/revendedora/pages/reseller/PaymentCard";
import ResellerPagarmePayment from "@/features/revendedora/pages/reseller/PagarmePayment";
import ResellerGamification from "@/features/revendedora/pages/reseller/Gamification";
import ResellerSettings from "@/features/revendedora/pages/reseller/Settings";

const RevendedoraApp = () => {
  return (
    <CompanyProvider>
      <Routes>
        {/* Rota principal - Redireciona para login da revendedora */}
        <Route path="/revendedora" element={<Navigate to="/revendedora/login" replace />} />

        {/* Login da revendedora */}
        <Route path="/revendedora/login" element={<Login />} />
        <Route path="/revendedora/demo" element={<Demo />} />

        {/* Rotas publicas */}
        <Route path="/revendedora/checkout/:linkToken" element={<Checkout />} />
        <Route path="/revendedora/store/:storeSlug" element={<Storefront />} />
        <Route path="/revendedora/order-success/:orderId" element={<OrderSuccess />} />
        <Route path="/revendedora/track-order/:orderId" element={<TrackOrder />} />
        <Route path="/revendedora/produto/:productId" element={<ProductView />} />

        {/* ===== ROTAS REVENDEDORA (apos login) ===== */}
        <Route path="/revendedora/reseller/dashboard" element={<ResellerLayout><ResellerDashboard /></ResellerLayout>} />
        <Route path="/revendedora/reseller/team" element={<ResellerLayout><ResellerTeam /></ResellerLayout>} />
        <Route path="/revendedora/reseller/sales" element={<ResellerLayout><ResellerSales /></ResellerLayout>} />
        <Route path="/revendedora/reseller/financial" element={<ResellerLayout><ResellerFinancial /></ResellerLayout>} />
        <Route path="/revendedora/reseller/store" element={<ResellerLayout><ResellerStore /></ResellerLayout>} />
        <Route path="/revendedora/reseller/checkout/:productId" element={<ResellerLayout><ResellerPagarmePayment /></ResellerLayout>} />
        <Route path="/revendedora/reseller/payment/pix/:saleId" element={<ResellerLayout><ResellerPaymentPix /></ResellerLayout>} />
        <Route path="/revendedora/reseller/payment/card/:saleId" element={<ResellerLayout><ResellerPaymentCard /></ResellerLayout>} />
        <Route path="/revendedora/reseller/gamification" element={<ResellerLayout><ResellerGamification /></ResellerLayout>} />
        <Route path="/revendedora/reseller/settings" element={<ResellerLayout><ResellerSettings /></ResellerLayout>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </CompanyProvider>
  );
};

export default RevendedoraApp;
