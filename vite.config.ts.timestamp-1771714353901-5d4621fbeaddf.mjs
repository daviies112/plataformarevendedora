// vite.config.ts
import { defineConfig } from "file:///C:/Users/davie/Downloads/Skill%20e%20mcp/loja/plataformarevendedora-main%20(2)/plataformarevendedora-main/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/davie/Downloads/Skill%20e%20mcp/loja/plataformarevendedora-main%20(2)/plataformarevendedora-main/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///C:/Users/davie/Downloads/Skill%20e%20mcp/loja/plataformarevendedora-main%20(2)/plataformarevendedora-main/node_modules/lovable-tagger/dist/index.js";
import tsconfigPaths from "file:///C:/Users/davie/Downloads/Skill%20e%20mcp/loja/plataformarevendedora-main%20(2)/plataformarevendedora-main/node_modules/vite-tsconfig-paths/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\davie\\Downloads\\Skill e mcp\\loja\\plataformarevendedora-main (2)\\plataformarevendedora-main";
var vite_config_default = defineConfig(({ mode }) => ({
  root: ".",
  publicDir: "public",
  define: {
    // ===== SUPABASE CONFIGURATION (RUNTIME, NÃO BUILD-TIME) =====
    // 
    // IMPORTANTE: Estas variáveis PODEM estar vazias propositalmente!
    // 
    // O frontend agora busca credenciais Supabase via API em RUNTIME:
    // - GET /api/config/supabase (não-autenticado, rate-limited)
    // - Credenciais armazenadas em PostgreSQL (tabela app_settings)
    // - Elimina dependência de Secrets durante build
    // 
    // Prioridades (ver src/lib/supabase.ts):
    // 1. API backend (runtime) - PostgreSQL app_settings
    // 2. Variáveis de ambiente (fallback durante migração)
    // 3. localStorage (fallback legado)
    // 
    // É SEGURO deixar vazio - aplicação funciona com graceful degradation
    "import.meta.env.REACT_APP_SUPABASE_URL": JSON.stringify(
      process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || ""
    ),
    "import.meta.env.REACT_APP_SUPABASE_ANON_KEY": JSON.stringify(
      process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || ""
    )
  },
  optimizeDeps: {
    exclude: ["whatsapp"],
    // ✅ OTIMIZAÇÃO CRÍTICA: Pré-otimiza dependências usadas em rotas públicas
    // Isso evita compilação on-demand que causa delay de 15s
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-router-dom",
      "@tanstack/react-query",
      "next-themes",
      "sonner",
      "lucide-react",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-toast",
      "@radix-ui/react-dialog",
      "@radix-ui/react-slot",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
      "zod",
      "react-hook-form",
      "@hookform/resolvers/zod",
      "date-fns",
      "date-fns/locale/pt-BR",
      "@supabase/supabase-js",
      "zustand",
      "axios"
    ],
    // Força pré-bundling na inicialização
    force: true
  },
  server: {
    host: "0.0.0.0",
    port: parseInt(process.env.PORT || "5002", 10),
    strictPort: true,
    allowedHosts: true,
    hmr: process.env.REPLIT_DEV_DOMAIN ? {
      protocol: "wss",
      host: process.env.REPLIT_DEV_DOMAIN,
      clientPort: 443,
      timeout: 12e4
    } : true
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: mode === "development",
    rollupOptions: {
      input: {
        main: path.resolve(__vite_injected_original_dirname, "index.html")
      },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("face-api") || id.includes("@tensorflow") || id.includes("tfjs")) {
              return "face-detection";
            }
            if (id.includes("fabric")) {
              return "label-designer";
            }
            if (id.includes("framer-motion") || id.includes("motion-dom")) {
              return "animations";
            }
            if (id.includes("recharts") || id.includes("d3-")) {
              return "charts";
            }
            if (id.includes("@100mslive") || id.includes("hms")) {
              return "video-meeting";
            }
            if (id.includes("html2pdf") || id.includes("jspdf") || id.includes("html2canvas")) {
              return "pdf-generator";
            }
            if (id.includes("@supabase")) {
              return "supabase";
            }
            if (id.includes("xlsx") || id.includes("exceljs")) {
              return "spreadsheet";
            }
            if (id.includes("@sentry")) {
              return "monitoring";
            }
            if (id.includes("qrcode") || id.includes("jsbarcode")) {
              return "barcode";
            }
            if (id.includes("date-fns")) {
              return "date-utils";
            }
            if (id.includes("zod")) {
              return "validation";
            }
            if (id.includes("@tanstack/react-query")) {
              return "query";
            }
            if (id.includes("axios")) {
              return "http";
            }
            if (id.includes("react") || id.includes("react-dom")) {
              return "react-core";
            }
            if (id.includes("react-router") || id.includes("wouter")) {
              return "router";
            }
            if (id.includes("@radix-ui")) {
              return "ui-vendor";
            }
            if (id.includes("lucide-react")) {
              return "icons";
            }
          }
        }
      }
    },
    chunkSizeWarningLimit: 500
  },
  plugins: [tsconfigPaths(), react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src"),
      "@assets": path.resolve(__vite_injected_original_dirname, "./attached_assets")
    }
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxkYXZpZVxcXFxEb3dubG9hZHNcXFxcU2tpbGwgZSBtY3BcXFxcbG9qYVxcXFxwbGF0YWZvcm1hcmV2ZW5kZWRvcmEtbWFpbiAoMilcXFxccGxhdGFmb3JtYXJldmVuZGVkb3JhLW1haW5cIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGRhdmllXFxcXERvd25sb2Fkc1xcXFxTa2lsbCBlIG1jcFxcXFxsb2phXFxcXHBsYXRhZm9ybWFyZXZlbmRlZG9yYS1tYWluICgyKVxcXFxwbGF0YWZvcm1hcmV2ZW5kZWRvcmEtbWFpblxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvZGF2aWUvRG93bmxvYWRzL1NraWxsJTIwZSUyMG1jcC9sb2phL3BsYXRhZm9ybWFyZXZlbmRlZG9yYS1tYWluJTIwKDIpL3BsYXRhZm9ybWFyZXZlbmRlZG9yYS1tYWluL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3Qtc3djXCI7XG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgY29tcG9uZW50VGFnZ2VyIH0gZnJvbSBcImxvdmFibGUtdGFnZ2VyXCI7XG5pbXBvcnQgdHNjb25maWdQYXRocyBmcm9tICd2aXRlLXRzY29uZmlnLXBhdGhzJztcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+ICh7XG4gIHJvb3Q6ICcuJyxcbiAgcHVibGljRGlyOiAncHVibGljJyxcbiAgZGVmaW5lOiB7XG4gICAgLy8gPT09PT0gU1VQQUJBU0UgQ09ORklHVVJBVElPTiAoUlVOVElNRSwgTlx1MDBDM08gQlVJTEQtVElNRSkgPT09PT1cbiAgICAvLyBcbiAgICAvLyBJTVBPUlRBTlRFOiBFc3RhcyB2YXJpXHUwMEUxdmVpcyBQT0RFTSBlc3RhciB2YXppYXMgcHJvcG9zaXRhbG1lbnRlIVxuICAgIC8vIFxuICAgIC8vIE8gZnJvbnRlbmQgYWdvcmEgYnVzY2EgY3JlZGVuY2lhaXMgU3VwYWJhc2UgdmlhIEFQSSBlbSBSVU5USU1FOlxuICAgIC8vIC0gR0VUIC9hcGkvY29uZmlnL3N1cGFiYXNlIChuXHUwMEUzby1hdXRlbnRpY2FkbywgcmF0ZS1saW1pdGVkKVxuICAgIC8vIC0gQ3JlZGVuY2lhaXMgYXJtYXplbmFkYXMgZW0gUG9zdGdyZVNRTCAodGFiZWxhIGFwcF9zZXR0aW5ncylcbiAgICAvLyAtIEVsaW1pbmEgZGVwZW5kXHUwMEVBbmNpYSBkZSBTZWNyZXRzIGR1cmFudGUgYnVpbGRcbiAgICAvLyBcbiAgICAvLyBQcmlvcmlkYWRlcyAodmVyIHNyYy9saWIvc3VwYWJhc2UudHMpOlxuICAgIC8vIDEuIEFQSSBiYWNrZW5kIChydW50aW1lKSAtIFBvc3RncmVTUUwgYXBwX3NldHRpbmdzXG4gICAgLy8gMi4gVmFyaVx1MDBFMXZlaXMgZGUgYW1iaWVudGUgKGZhbGxiYWNrIGR1cmFudGUgbWlncmFcdTAwRTdcdTAwRTNvKVxuICAgIC8vIDMuIGxvY2FsU3RvcmFnZSAoZmFsbGJhY2sgbGVnYWRvKVxuICAgIC8vIFxuICAgIC8vIFx1MDBDOSBTRUdVUk8gZGVpeGFyIHZhemlvIC0gYXBsaWNhXHUwMEU3XHUwMEUzbyBmdW5jaW9uYSBjb20gZ3JhY2VmdWwgZGVncmFkYXRpb25cbiAgICAnaW1wb3J0Lm1ldGEuZW52LlJFQUNUX0FQUF9TVVBBQkFTRV9VUkwnOiBKU09OLnN0cmluZ2lmeShcbiAgICAgIHByb2Nlc3MuZW52LlNVUEFCQVNFX1VSTCB8fCBwcm9jZXNzLmVudi5SRUFDVF9BUFBfU1VQQUJBU0VfVVJMIHx8ICcnXG4gICAgKSxcbiAgICAnaW1wb3J0Lm1ldGEuZW52LlJFQUNUX0FQUF9TVVBBQkFTRV9BTk9OX0tFWSc6IEpTT04uc3RyaW5naWZ5KFxuICAgICAgcHJvY2Vzcy5lbnYuU1VQQUJBU0VfQU5PTl9LRVkgfHwgcHJvY2Vzcy5lbnYuUkVBQ1RfQVBQX1NVUEFCQVNFX0FOT05fS0VZIHx8ICcnXG4gICAgKSxcbiAgfSxcbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgZXhjbHVkZTogWyd3aGF0c2FwcCddLFxuICAgIC8vIFx1MjcwNSBPVElNSVpBXHUwMEM3XHUwMEMzTyBDUlx1MDBDRFRJQ0E6IFByXHUwMEU5LW90aW1pemEgZGVwZW5kXHUwMEVBbmNpYXMgdXNhZGFzIGVtIHJvdGFzIHBcdTAwRkFibGljYXNcbiAgICAvLyBJc3NvIGV2aXRhIGNvbXBpbGFcdTAwRTdcdTAwRTNvIG9uLWRlbWFuZCBxdWUgY2F1c2EgZGVsYXkgZGUgMTVzXG4gICAgaW5jbHVkZTogW1xuICAgICAgJ3JlYWN0JyxcbiAgICAgICdyZWFjdC1kb20nLFxuICAgICAgJ3JlYWN0LWRvbS9jbGllbnQnLFxuICAgICAgJ3JlYWN0LXJvdXRlci1kb20nLFxuICAgICAgJ0B0YW5zdGFjay9yZWFjdC1xdWVyeScsXG4gICAgICAnbmV4dC10aGVtZXMnLFxuICAgICAgJ3Nvbm5lcicsXG4gICAgICAnbHVjaWRlLXJlYWN0JyxcbiAgICAgICdAcmFkaXgtdWkvcmVhY3QtdG9vbHRpcCcsXG4gICAgICAnQHJhZGl4LXVpL3JlYWN0LXRvYXN0JyxcbiAgICAgICdAcmFkaXgtdWkvcmVhY3QtZGlhbG9nJyxcbiAgICAgICdAcmFkaXgtdWkvcmVhY3Qtc2xvdCcsXG4gICAgICAnY2xhc3MtdmFyaWFuY2UtYXV0aG9yaXR5JyxcbiAgICAgICdjbHN4JyxcbiAgICAgICd0YWlsd2luZC1tZXJnZScsXG4gICAgICAnem9kJyxcbiAgICAgICdyZWFjdC1ob29rLWZvcm0nLFxuICAgICAgJ0Bob29rZm9ybS9yZXNvbHZlcnMvem9kJyxcbiAgICAgICdkYXRlLWZucycsXG4gICAgICAnZGF0ZS1mbnMvbG9jYWxlL3B0LUJSJyxcbiAgICAgICdAc3VwYWJhc2Uvc3VwYWJhc2UtanMnLFxuICAgICAgJ3p1c3RhbmQnLFxuICAgICAgJ2F4aW9zJyxcbiAgICBdLFxuICAgIC8vIEZvclx1MDBFN2EgcHJcdTAwRTktYnVuZGxpbmcgbmEgaW5pY2lhbGl6YVx1MDBFN1x1MDBFM29cbiAgICBmb3JjZTogdHJ1ZSxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgaG9zdDogXCIwLjAuMC4wXCIsXG4gICAgcG9ydDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuUE9SVCB8fCAnNTAwMicsIDEwKSxcbiAgICBzdHJpY3RQb3J0OiB0cnVlLFxuICAgIGFsbG93ZWRIb3N0czogdHJ1ZSxcbiAgICBobXI6IHByb2Nlc3MuZW52LlJFUExJVF9ERVZfRE9NQUlOID8ge1xuICAgICAgcHJvdG9jb2w6ICd3c3MnLFxuICAgICAgaG9zdDogcHJvY2Vzcy5lbnYuUkVQTElUX0RFVl9ET01BSU4sXG4gICAgICBjbGllbnRQb3J0OiA0NDMsXG4gICAgICB0aW1lb3V0OiAxMjAwMDAsXG4gICAgfSA6IHRydWUsXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgdGFyZ2V0OiAnZXNuZXh0JyxcbiAgICBtaW5pZnk6ICdlc2J1aWxkJyxcbiAgICBzb3VyY2VtYXA6IG1vZGUgPT09ICdkZXZlbG9wbWVudCcsXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgaW5wdXQ6IHtcbiAgICAgICAgbWFpbjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJ2luZGV4Lmh0bWwnKSxcbiAgICAgIH0sXG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgbWFudWFsQ2h1bmtzKGlkKSB7XG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMnKSkge1xuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdmYWNlLWFwaScpIHx8IGlkLmluY2x1ZGVzKCdAdGVuc29yZmxvdycpIHx8IGlkLmluY2x1ZGVzKCd0ZmpzJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICdmYWNlLWRldGVjdGlvbic7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ2ZhYnJpYycpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAnbGFiZWwtZGVzaWduZXInO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdmcmFtZXItbW90aW9uJykgfHwgaWQuaW5jbHVkZXMoJ21vdGlvbi1kb20nKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ2FuaW1hdGlvbnMnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdyZWNoYXJ0cycpIHx8IGlkLmluY2x1ZGVzKCdkMy0nKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ2NoYXJ0cyc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ0AxMDBtc2xpdmUnKSB8fCBpZC5pbmNsdWRlcygnaG1zJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICd2aWRlby1tZWV0aW5nJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnaHRtbDJwZGYnKSB8fCBpZC5pbmNsdWRlcygnanNwZGYnKSB8fCBpZC5pbmNsdWRlcygnaHRtbDJjYW52YXMnKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ3BkZi1nZW5lcmF0b3InO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdAc3VwYWJhc2UnKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ3N1cGFiYXNlJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygneGxzeCcpIHx8IGlkLmluY2x1ZGVzKCdleGNlbGpzJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICdzcHJlYWRzaGVldCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ0BzZW50cnknKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ21vbml0b3JpbmcnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdxcmNvZGUnKSB8fCBpZC5pbmNsdWRlcygnanNiYXJjb2RlJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICdiYXJjb2RlJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnZGF0ZS1mbnMnKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ2RhdGUtdXRpbHMnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCd6b2QnKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ3ZhbGlkYXRpb24nO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdAdGFuc3RhY2svcmVhY3QtcXVlcnknKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ3F1ZXJ5JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnYXhpb3MnKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ2h0dHAnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdyZWFjdCcpIHx8IGlkLmluY2x1ZGVzKCdyZWFjdC1kb20nKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ3JlYWN0LWNvcmUnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdyZWFjdC1yb3V0ZXInKSB8fCBpZC5pbmNsdWRlcygnd291dGVyJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICdyb3V0ZXInO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdAcmFkaXgtdWknKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ3VpLXZlbmRvcic7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ2x1Y2lkZS1yZWFjdCcpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAnaWNvbnMnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDUwMCxcbiAgfSxcbiAgcGx1Z2luczogW3RzY29uZmlnUGF0aHMoKSwgcmVhY3QoKSwgbW9kZSA9PT0gXCJkZXZlbG9wbWVudFwiICYmIGNvbXBvbmVudFRhZ2dlcigpXS5maWx0ZXIoQm9vbGVhbiksXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi9zcmNcIiksXG4gICAgICBcIkBhc3NldHNcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL2F0dGFjaGVkX2Fzc2V0c1wiKSxcbiAgICB9LFxuICB9LFxufSkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFpZixTQUFTLG9CQUFvQjtBQUM5Z0IsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUNqQixTQUFTLHVCQUF1QjtBQUNoQyxPQUFPLG1CQUFtQjtBQUoxQixJQUFNLG1DQUFtQztBQU96QyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssT0FBTztBQUFBLEVBQ3pDLE1BQU07QUFBQSxFQUNOLFdBQVc7QUFBQSxFQUNYLFFBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQWdCTiwwQ0FBMEMsS0FBSztBQUFBLE1BQzdDLFFBQVEsSUFBSSxnQkFBZ0IsUUFBUSxJQUFJLDBCQUEwQjtBQUFBLElBQ3BFO0FBQUEs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
