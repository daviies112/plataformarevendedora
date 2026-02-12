import type { Express } from "express";
import { createServer } from "http";
import multer from "multer";
import path from "path";
import { authRoutes } from "./routes/auth";
import { automationRoutes } from "./routes/automation";
import { credentialsRoutes } from "./routes/credentials";
import { dashboardRoutes } from "./routes/dashboard";
import { registerNotificationRoutes } from "./routes/notifications";
import evolutionRoutes from "./routes/evolution";
import whatsappRoutes from "./routes/whatsapp";
import { clientsRoutes } from "./routes/clients";
import { registerWhatsAppCompleteRoutes } from "./routes/whatsapp-complete";
import { exportRoutes } from "./routes/export";
import { setupComplianceRoutes } from "./routes/compliance";
import { requireTenant } from "./middleware/requireTenant";
import { leadsPipelineRoutes } from "./routes/leadsPipelineRoutes";
// import n8nRouter from "./routes/n8n"; // REMOVED
import resellerAuthRoutes from "./routes/resellerAuth";
import resellerCatalogRoutes from "./routes/resellerCatalog";
import pagarmeRoutes from "./routes/pagarme";
import pagarmePublicRoutes from "./routes/pagarmePublic";
import publicStoreRoutes from "./routes/publicStore";
import walletRoutes from "./routes/wallet";
import splitRoutes from "./routes/split";
import monitoringRoutes from "./routes/monitoring";

// Configure multer for logo uploads
const logoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/logos/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const logoUpload = multer({
  storage: logoStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas (PNG, JPG, GIF, WebP)'));
    }
  }
});

export async function registerRoutes(app: Express) {
  // Create HTTP server
  const httpServer = createServer(app);

  // 🔍 MONITORING ROUTES - Must be registered first (no auth required)
  // Health check and monitoring logs for frontend monitoring system
  app.use("/api", monitoringRoutes);

  app.use("/auth", authRoutes);

  // 🌐 PUBLIC ROUTES - Must be registered BEFORE the global /api middleware

  // Public store routes - allows customers to view reseller stores without auth
  app.use("/api/public", publicStoreRoutes);

  // N8N integration routes - REMOVED
  /*
  app.use("/api/n8n", n8nRouter);
  */

  // Split / Recipient bootstrap routes for Pagar.me configuration
  // REGISTERED EARLY to avoid global /api middleware
  console.log('[Split Routes] Registering split routes early');
  app.use("/api/split", splitRoutes);

  // Reseller authentication routes - PUBLIC (login/register don't need auth)
  // Apply JWT fallback middleware for token-based auth (for iframe contexts where cookies fail)
  const { resellerAuthMiddleware } = await import("./routes/resellerAuth");
  app.use("/api/reseller", resellerAuthMiddleware, resellerAuthRoutes);
  app.use("/api/reseller", resellerAuthMiddleware, resellerCatalogRoutes);

  // Public checkout routes - NO AUTH required (for public store purchases)
  // Must be registered BEFORE redirectIfNotAuth middleware
  app.use("/api/public/checkout", pagarmePublicRoutes);
  app.use("/api/public/store", publicStoreRoutes);

  // Public shipping quote route - REMOVED
  /*
  const { totalExpressService } = await import("./services/totalExpressService");
  app.post("/api/public/frete/cotar", async (req, res) => {
    // ...
  });
  */

  // Import utilities for protection logic
  const { log } = await import("./vite");
  const { SUPABASE_CONFIGURED } = await import("./config/supabaseOwner");
  const { redirectIfNotAuth } = await import("./middleware/multiTenantAuth");

  // Compliance routes (CPF check) - public access allowed with DEMO fallback
  app.use(setupComplianceRoutes());

  // PROTEÇÃO DE ROTAS: Verificar autenticação antes de acessar rotas protegidas
  if (SUPABASE_CONFIGURED) {
    app.use(redirectIfNotAuth);
    log('🔐 Multi-tenant authentication enabled');
  }

  // Leads Pipeline routes
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    app.use("/api/leads-pipeline", leadsPipelineRoutes);
  } else {
    app.use("/api/leads-pipeline", requireTenant, leadsPipelineRoutes);
  }

  if (isDev) {
    app.use("/api/export", exportRoutes);
  } else {
    app.use("/api/export", requireTenant, exportRoutes);
  }

  app.use("/api/automation", requireTenant, automationRoutes);
  app.use("/api/credentials", requireTenant, credentialsRoutes);
  app.use("/api/dashboard", requireTenant, dashboardRoutes);
  app.use("/api/clients", requireTenant, clientsRoutes);
  registerNotificationRoutes(app);
  app.use("/api/evolution", requireTenant, evolutionRoutes);
  app.use("/api/whatsapp", requireTenant, whatsappRoutes);
  registerWhatsAppCompleteRoutes(app);

  // KANBAN PLATFORM ROUTES
  const { kanbanStorage } = await import("./storage/kanbanStorage");

  app.get("/api/kanban-leads", requireTenant, async (req, res) => {
    try {
      const leads = await kanbanStorage.getAllLeads();
      res.json(leads);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  app.post("/api/upload/logo", requireTenant, logoUpload.single('logo'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
      res.json({ success: true, url: `/uploads/logos/${req.file.filename}` });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Falha ao fazer upload' });
    }
  });

  // Pagar.me payment routes
  // NOTE: Public checkout routes are registered earlier (before redirectIfNotAuth) at line ~104
  // Webhook endpoint must be PUBLIC for Pagar.me to send payment notifications
  app.use("/api/pagarme/webhook", pagarmeRoutes);
  // All other payment routes require authentication
  app.use("/api/pagarme", requireTenant, pagarmeRoutes);

  // Wallet / Credit System routes
  // Webhook endpoint must be PUBLIC for Pagar.me to credit wallet on payment
  app.use("/api/wallet/webhook", walletRoutes);
  // All other wallet routes require authentication
  app.use("/api/wallet", requireTenant, walletRoutes);

  // Horarios disponiveis routes (meeting schedules)
  const { registerHorariosRoutes } = await import("./routes/horarios");
  registerHorariosRoutes(app);

  return httpServer;
}
