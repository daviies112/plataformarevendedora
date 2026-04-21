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
  card_color: string;
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
  card_color: '#1a1a2e',
};

interface CompanyContextType {
  reseller: Reseller | null;
  branding: BrandingConfig;
  loading: boolean;
  brandingLoading: boolean;
  refetch: () => Promise<void>;
  refetchBranding: () => Promise<void>;
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
  // Remover style tag anterior se existir
  const existingStyle = document.getElementById('nexus-branding-vars');
  if (existingStyle) existingStyle.remove();

  // As 7 cores base do branding
  const bg = branding.background_color;         // Cor de Fundo
  const titleColor = branding.heading_color;    // Cor dos Titulos
  const textColor = branding.text_color;        // Cor do Texto
  const btnBg = branding.button_color;          // Cor do Botao
  const btnText = branding.button_text_color;   // Cor do Texto do Botao
  const cardBg = branding.card_color || branding.sidebar_background; // Cor do Container
  const sidebarBg = branding.sidebar_background; // Cor da Barra Lateral

  // LOGICA DE CONTRASTE INTELIGENTE:
  // Para cada superficie, escolhemos o elemento sobreposto com maior contraste

  // Botao: se button_color nao tem contraste suficiente contra o fundo, usar container
  const btnContrastVsBg = getContrastRatio(bg, btnBg);
  // Se botao e fundo sao parecidos (contraste < 2.5), usar cor do container como botao
  const effectiveBtnBg = btnContrastVsBg < 2.5 ? cardBg : btnBg;
  // Texto do botao: escolher entre branco e o que foi configurado, o que tiver mais contraste
  const effectiveBtnText = pickContrastColor(effectiveBtnBg, btnText, '#ffffff');

  // Primary = cor do botao efetiva (com contraste garantido)
  // Se ainda assim o contraste e ruim, usar sidebar (geralmente mais escura)
  const finalPrimary = getContrastRatio(bg, effectiveBtnBg) >= 2.5 ? effectiveBtnBg : sidebarBg;
  const finalPrimaryFg = pickContrastColor(finalPrimary, '#ffffff', textColor);

  // Card: se card e fundo sao iguais, usar sidebar como card
  const finalCard = getContrastRatio(bg, cardBg) < 1.3 ? sidebarBg : cardBg;
  const finalCardFg = pickContrastColor(finalCard, '#ffffff', textColor);

  // Muted: versao mais escura do card
  const finalMuted = sidebarBg;
  const finalMutedFg = pickContrastColor(finalMuted, 'rgba(255,255,255,0.6)', 'rgba(0,0,0,0.5)');

  // Border: cor com algum contraste contra o card
  const finalBorder = pickContrastColor(finalCard, 'rgba(255,255,255,0.15)', 'rgba(0,0,0,0.15)');

  // Calcular muted: precisa ter contraste contra background
  // Se sidebar == background, usar uma versao mais escura/clara do card
  const mutedBg = finalCard; // container sempre tem algum contraste vs fundo
  const mutedFg = pickContrastColor(mutedBg, '#ffffff', textColor); // branco ou text sobre muted

  // Border: linha sutil mas visivel contra o card
  const borderColor = pickContrastColor(finalCard, 'rgba(255,255,255,0.2)', 'rgba(0,0,0,0.2)');
  const borderHex = finalCard === cardBg ? sidebarBg : cardBg; // usar a outra cor como borda

  const style = document.createElement('style');
  style.id = 'nexus-branding-vars';
  style.textContent = [
    ':root {',
    `  --primary: ${hexToHSL(finalPrimary)} !important;`,
    `  --primary-foreground: ${hexToHSL(finalPrimaryFg)} !important;`,
    `  --background: ${hexToHSL(bg)} !important;`,
    `  --foreground: ${hexToHSL(textColor)} !important;`,
    `  --card: ${hexToHSL(finalCard)} !important;`,
    `  --card-foreground: ${hexToHSL(finalCardFg)} !important;`,
    `  --border: ${hexToHSL(borderHex)} !important;`,
    `  --input: ${hexToHSL(finalCard)} !important;`,
    `  --muted: ${hexToHSL(mutedBg)} !important;`,
    `  --muted-foreground: ${hexToHSL(mutedFg)} !important;`,
    `  --ring: ${hexToHSL(finalPrimary)} !important;`,
    `  --secondary: ${hexToHSL(finalCard)} !important;`,
    `  --secondary-foreground: ${hexToHSL(finalCardFg)} !important;`,
    `  --accent: ${hexToHSL(finalPrimary)} !important;`,
    `  --accent-foreground: ${hexToHSL(finalPrimaryFg)} !important;`,
    `  --popover: ${hexToHSL(finalCard)} !important;`,
    `  --popover-foreground: ${hexToHSL(finalCardFg)} !important;`,
    '}',
  ].join('\n');
  document.head.appendChild(style);

  // Vars brand-* para uso direto nos componentes
  const root = document.documentElement;
  root.style.setProperty('--brand-background', bg);
  root.style.setProperty('--brand-text', textColor);
  root.style.setProperty('--brand-heading', titleColor);
  root.style.setProperty('--brand-button', finalPrimary);
  root.style.setProperty('--brand-button-text', finalPrimaryFg);
  root.style.setProperty('--brand-card', finalCard);
  root.style.setProperty('--brand-sidebar', sidebarBg);
  root.style.setProperty('--brand-primary', branding.primary_color);
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
            card_color: data.card_color || DEFAULT_BRANDING.card_color,
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
            card_color: data.card_color || DEFAULT_BRANDING.card_color,
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
