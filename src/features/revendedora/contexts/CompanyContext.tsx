import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useSupabase } from './SupabaseContext';
import type { Tables } from '@/features/revendedora/integrations/supabase/types';

type Reseller = Tables<'resellers'>;

interface BrandingConfig {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  sidebar_background: string;
  sidebar_text: string;
  button_color: string;
  button_text_color: string;
  text_color: string;
  heading_color: string;
  selected_item_color: string;
  logo_url: string | null;
  logo_size: string;
  logo_position: string;
  company_name: string;
  card_color: string | null;
}

const DEFAULT_BRANDING: BrandingConfig = {
  primary_color: '#9b87f5',
  secondary_color: '#7e69ab',
  accent_color: '#d946ef',
  background_color: '#ffffff',
  sidebar_background: '#1a1a1a',
  sidebar_text: '#ffffff',
  button_color: '#9b87f5',
  button_text_color: '#ffffff',
  text_color: '#000000',
  heading_color: '#1a1a1a',
  selected_item_color: '#9b87f5',
  logo_url: null,
  logo_size: 'medium',
  logo_position: 'left',
  company_name: 'NEXUS',
  card_color: null, // sem cor de card - usar tema padrao
};

interface CompanyContextType {
  reseller: Reseller | null;
  branding: BrandingConfig;
  loading: boolean;
  brandingLoading: boolean;
  refetch: () => Promise<void>;
  refetchBranding: () => Promise<void>;
  // Carrega branding a partir de um slug publico da empresa (/revendedora/:companySlug/login)
  // Retorna o tenant_id resolvido, ou null se o slug nao existir.
  loadBrandingBySlug: (companySlug: string) => Promise<string | null>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function hexToHSL(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0% 0%';

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function lightenHSL(hex: string, amount: number): string {
  // Clareia a cor aumentando a luminosidade (amount em 0-100)
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0% 50%';
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  const newL = Math.min(100, Math.round(l * 100) + amount);
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${newL}%`;
}

function getLuminance(hex: string): number {
  // Calcula luminancia relativa (0=preto, 1=branco)
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return 0;
  const [r, g, b] = [result[1], result[2], result[3]].map(c => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function pickContrastColor(bg: string, option1: string, option2: string): string {
  // Retorna a opcao com maior contraste contra o fundo
  const c1 = getContrastRatio(bg, option1);
  const c2 = getContrastRatio(bg, option2);
  return c1 >= c2 ? option1 : option2;
}

function applyBrandingToCSS(branding: BrandingConfig) {
  const root = document.documentElement;

  root.style.setProperty('--brand-primary', branding.primary_color);
  root.style.setProperty('--brand-secondary', branding.secondary_color);
  root.style.setProperty('--brand-accent', branding.accent_color);
  root.style.setProperty('--brand-background', branding.background_color);
  root.style.setProperty('--brand-sidebar-bg', branding.sidebar_background);
  root.style.setProperty('--brand-sidebar-text', branding.sidebar_text);
  root.style.setProperty('--brand-button', branding.button_color);
  root.style.setProperty('--brand-button-text', branding.button_text_color);
  root.style.setProperty('--brand-text', branding.text_color);
  root.style.setProperty('--brand-heading', branding.heading_color);
  root.style.setProperty('--brand-selected', branding.selected_item_color);

  // 🎨 Title + Favicon dinâmico por tenant (plataformarevendedora)
  if (branding.company_name && branding.company_name !== 'NEXUS') {
    document.title = branding.company_name;
  }
  if (branding.logo_url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 64, 64);
      try {
        document.querySelectorAll('link[rel="icon"]').forEach(e => e.remove());
        const link = document.createElement('link');
        link.rel = 'icon'; link.type = 'image/png';
        link.href = canvas.toDataURL('image/png');
        document.head.appendChild(link);
      } catch {}
    };
    img.src = branding.logo_url;
  }

  // Sobrescrever variaveis globais do tema com as cores do branding
  // Isso garante que componentes shadcn/Tailwind usem as cores certas
  if (branding.button_color) {
    root.style.setProperty('--primary', hexToHSL(branding.button_color));
    root.style.setProperty('--ring', hexToHSL(branding.button_color));
  }
  if (branding.button_text_color) {
    root.style.setProperty('--primary-foreground', hexToHSL(branding.button_text_color));
  }
  if (branding.heading_color) {
    root.style.setProperty('--foreground', hexToHSL(branding.heading_color));
  }
  if (branding.text_color) {
    root.style.setProperty('--muted-foreground', hexToHSL(branding.text_color));
  }
  if (branding.background_color) {
    root.style.setProperty('--background', hexToHSL(branding.background_color));
  }

  // Cor do Container (card_color) - aplica nos cards quando configurado
  if (branding.card_color) {
    root.style.setProperty('--brand-card', branding.card_color);
    // Injetar estilo para sobrescrever --card do tema shadcn/tailwind
    const existing = document.getElementById('nexus-card-color');
    if (existing) existing.remove();
    const style = document.createElement('style');
    style.id = 'nexus-card-color';
    const cardHSL = hexToHSL(branding.card_color);
    const fgHSL = hexToHSL(branding.text_color);
    // card-foreground: usar cor escura para contraste sobre card branco
    const cardFgHSL = '0 0% 10%'; // texto escuro para card branco
    const inputHSL = lightenHSL(branding.card_color, 15);
    style.textContent = `:root { --card: ${cardHSL} !important; --card-foreground: ${cardFgHSL} !important; --input: ${inputHSL} !important; } .dark { --card: ${cardHSL} !important; --card-foreground: ${cardFgHSL} !important; --input: ${inputHSL} !important; } html.dark { --card: ${cardHSL} !important; --card-foreground: ${cardFgHSL} !important; --input: ${inputHSL} !important; }`;
    document.head.appendChild(style);
  } else {
    // Remover override se nao houver card_color configurado (usar branco padrao do tema)
    const existing = document.getElementById('nexus-card-color');
    if (existing) existing.remove();
    root.style.removeProperty('--brand-card');
  }
}
export function CompanyProvider({ children }: { children: ReactNode }) {
  const supabaseContext = useSupabase();

  const { client: supabase, loading: supabaseLoading, configured } = supabaseContext;
  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(false);
  const [brandingLoading, setBrandingLoading] = useState(true);

  const fetchBrandingData = useCallback(async () => {
    setBrandingLoading(true);
    try {
      // Estrategia automatica de branding multitenant:
      // 1. Se autenticado: /api/reseller/branding (usa sessao do servidor -> tenant automatico)
      // 2. Se nao autenticado: /api/public/branding?tenant=X (usa query param ou localStorage)

      // Tentar primeiro o endpoint autenticado (sessao tem tenantId)
      const sessionResp = await fetch('/api/reseller/branding', { credentials: 'include' });
      if (sessionResp.ok) {
        const data = await sessionResp.json();
        if (data && data.button_color && !data.notFound) {
          console.log('[CompanyContext] Branding carregado via sessao para tenant:', data.tenant_id);
          const newBranding: BrandingConfig = {
            primary_color: data.primary_color || DEFAULT_BRANDING.primary_color,
            secondary_color: data.secondary_color || DEFAULT_BRANDING.secondary_color,
            accent_color: data.accent_color || DEFAULT_BRANDING.accent_color,
            background_color: data.background_color || DEFAULT_BRANDING.background_color,
            sidebar_background: data.sidebar_background || DEFAULT_BRANDING.sidebar_background,
            sidebar_text: data.sidebar_text || DEFAULT_BRANDING.sidebar_text,
            button_color: data.button_color || DEFAULT_BRANDING.button_color,
            button_text_color: data.button_text_color || DEFAULT_BRANDING.button_text_color,
            text_color: data.text_color || DEFAULT_BRANDING.text_color,
            heading_color: data.heading_color || DEFAULT_BRANDING.heading_color,
            selected_item_color: data.selected_item_color || DEFAULT_BRANDING.selected_item_color,
            logo_url: data.logo_url || null,
            logo_size: data.logo_size || DEFAULT_BRANDING.logo_size,
            logo_position: data.logo_position || DEFAULT_BRANDING.logo_position,
            company_name: data.company_name || DEFAULT_BRANDING.company_name,
            card_color: data.card_color || null, // null = tema padrao (cards brancos)
          };
          setBranding(newBranding);
          applyBrandingToCSS(newBranding);
          // Salvar tenantId no localStorage para o endpoint publico
          if (data.tenant_id) {
            try { localStorage.setItem('nexus_tenant_id', data.tenant_id); } catch (_) {}
          }
          setBrandingLoading(false);
          return;
        }
      }

      // Fallback: endpoint publico SEM tenant na URL
      // O servidor resolve o tenant automaticamente pelo hostname (dominio da empresa)
      // ou pelo REID_TENANT_ID do .env - NUNCA pela URL publica
      // 🔐 SEGURANÇA: tenant_id nunca é exposto na URL do browser
      const brandingUrl = '/api/public/branding';

      console.log('[CompanyContext] Buscando branding publico (tenant resolvido pelo servidor)');
      const publicResp = await fetch(brandingUrl);
      if (publicResp.ok) {
        const data = await publicResp.json();
        if (data && data.button_color) {
          const newBranding: BrandingConfig = {
            primary_color: data.primary_color || DEFAULT_BRANDING.primary_color,
            secondary_color: data.secondary_color || DEFAULT_BRANDING.secondary_color,
            accent_color: data.accent_color || DEFAULT_BRANDING.accent_color,
            background_color: data.background_color || DEFAULT_BRANDING.background_color,
            sidebar_background: data.sidebar_background || DEFAULT_BRANDING.sidebar_background,
            sidebar_text: data.sidebar_text || DEFAULT_BRANDING.sidebar_text,
            button_color: data.button_color || DEFAULT_BRANDING.button_color,
            button_text_color: data.button_text_color || DEFAULT_BRANDING.button_text_color,
            text_color: data.text_color || DEFAULT_BRANDING.text_color,
            heading_color: data.heading_color || DEFAULT_BRANDING.heading_color,
            selected_item_color: data.selected_item_color || DEFAULT_BRANDING.selected_item_color,
            logo_url: data.logo_url || null,
            logo_size: data.logo_size || DEFAULT_BRANDING.logo_size,
            logo_position: data.logo_position || DEFAULT_BRANDING.logo_position,
            company_name: data.company_name || DEFAULT_BRANDING.company_name,
            card_color: data.card_color || null, // null = tema padrao (cards brancos)
          };
          setBranding(newBranding);
          applyBrandingToCSS(newBranding);
          setBrandingLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn('[CompanyContext] Erro ao carregar branding:', err);
    }
    applyBrandingToCSS(DEFAULT_BRANDING);
    setBrandingLoading(false);
  }, []);

  // Carrega branding a partir do slug publico da empresa (rota /revendedora/:companySlug/login)
  // Usado ANTES do login - nao depende de sessao nem de hostname/subdominio.
  const loadBrandingBySlug = useCallback(async (companySlug: string): Promise<string | null> => {
    setBrandingLoading(true);
    try {
      const resp = await fetch(`/api/reseller/login-info/${encodeURIComponent(companySlug)}`);
      if (!resp.ok) {
        console.warn('[CompanyContext] Slug nao encontrado:', companySlug);
        applyBrandingToCSS(DEFAULT_BRANDING);
        setBranding(DEFAULT_BRANDING);
        setBrandingLoading(false);
        return null;
      }
      const data = await resp.json();
      const newBranding: BrandingConfig = {
        primary_color: data.primary_color || DEFAULT_BRANDING.primary_color,
        secondary_color: data.secondary_color || DEFAULT_BRANDING.secondary_color,
        accent_color: data.accent_color || DEFAULT_BRANDING.accent_color,
        background_color: data.background_color || DEFAULT_BRANDING.background_color,
        sidebar_background: data.sidebar_background || DEFAULT_BRANDING.sidebar_background,
        sidebar_text: data.sidebar_text || DEFAULT_BRANDING.sidebar_text,
        button_color: data.button_color || DEFAULT_BRANDING.button_color,
        button_text_color: data.button_text_color || DEFAULT_BRANDING.button_text_color,
        text_color: data.text_color || DEFAULT_BRANDING.text_color,
        heading_color: data.heading_color || DEFAULT_BRANDING.heading_color,
        selected_item_color: data.selected_item_color || DEFAULT_BRANDING.selected_item_color,
        logo_url: data.logo_url || null,
        logo_size: data.logo_size || DEFAULT_BRANDING.logo_size,
        logo_position: data.logo_position || DEFAULT_BRANDING.logo_position,
        company_name: data.company_name || DEFAULT_BRANDING.company_name,
        card_color: data.card_color || null,
      };
      setBranding(newBranding);
      applyBrandingToCSS(newBranding);
      if (data.tenant_id) {
        try { localStorage.setItem('nexus_tenant_id', data.tenant_id); } catch (_) {}
        try { localStorage.setItem('nexus_company_slug', companySlug); } catch (_) {}
      }
      setBrandingLoading(false);
      return data.tenant_id || null;
    } catch (err) {
      console.warn('[CompanyContext] Erro ao carregar branding por slug:', err);
      applyBrandingToCSS(DEFAULT_BRANDING);
      setBranding(DEFAULT_BRANDING);
      setBrandingLoading(false);
      return null;
    }
  }, []);

  const fetchCompanyData = async () => {
    setReseller(null);
    setLoading(false);
  };

  useEffect(() => {
    if (supabaseLoading) {
      return;
    }

    fetchBrandingData();

    if (!supabase || !configured) {
      return;
    }

    const channel = supabase
      .channel('branding_updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'companies' },
        (payload) => {
          console.log('[CompanyContext] Branding update detected:', payload);
          fetchBrandingData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, supabaseLoading, configured, fetchBrandingData]);

  useEffect(() => {
    if (supabaseLoading || !configured) return;

    const interval = setInterval(() => {
      fetchBrandingData();
    }, 60000);

    return () => clearInterval(interval);
  }, [supabaseLoading, configured, fetchBrandingData]);

  return (
    <CompanyContext.Provider value={{
      reseller,
      branding,
      loading,
      brandingLoading,
      refetch: fetchCompanyData,
      refetchBranding: fetchBrandingData,
      loadBrandingBySlug,
    }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}

export function useBranding() {
  const { branding, brandingLoading, refetchBranding } = useCompany();
  return { branding, loading: brandingLoading, refetch: refetchBranding };
}

export type { BrandingConfig };
