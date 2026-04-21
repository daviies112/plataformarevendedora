import { ReactNode, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppHeader } from '@/features/revendedora/components/AppHeader';
import { useCompany } from '@/features/revendedora/contexts/CompanyContext';
import { ChatWidget } from '@/features/revendedora/components/chat/ChatWidget';
import { SupabaseProvider } from '@/features/revendedora/contexts/SupabaseContext';
import { getResellerToken, clearResellerToken } from '@/features/revendedora/lib/resellerAuth';
import {
  LayoutDashboard, TrendingUp, Wallet, Store,
  Trophy, UsersRound, Settings, LogOut, Building2
} from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';

interface ResellerLayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { title: 'Dashboard', url: '/revendedora/reseller/dashboard', icon: LayoutDashboard },
  { title: 'Vendas', url: '/revendedora/reseller/sales', icon: TrendingUp },
  { title: 'Financeiro', url: '/revendedora/reseller/financial', icon: Wallet },
  { title: 'Loja', url: '/revendedora/reseller/store', icon: Store },
  { title: 'Gamifica\u00e7\u00e3o', url: '/revendedora/reseller/gamification', icon: Trophy },
  { title: 'Equipe', url: '/revendedora/reseller/team', icon: UsersRound },
  { title: 'Config.', url: '/revendedora/reseller/settings', icon: Settings },
];

// Bottom nav usa só 5 itens principais
const BOTTOM_NAV = [
  { title: 'Dashboard', url: '/revendedora/reseller/dashboard', icon: LayoutDashboard },
  { title: 'Vendas', url: '/revendedora/reseller/sales', icon: TrendingUp },
  { title: 'Financeiro', url: '/revendedora/reseller/financial', icon: Wallet },
  { title: 'Loja', url: '/revendedora/reseller/store', icon: Store },
  { title: 'Gamifica\u00e7\u00e3o', url: '/revendedora/reseller/gamification', icon: Trophy },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

function ResellerLayoutContent({ children }: ResellerLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { branding } = useCompany();
  const isMobile = useIsMobile();
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'redirecting'>('checking');

  useEffect(() => {
    const token = getResellerToken();
    if (!token) {
      setAuthState('redirecting');
      navigate('/revendedora/login', { replace: true });
    } else {
      setAuthState('authenticated');
    }
  }, [navigate]);

  if (authState !== 'authenticated') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: branding.background_color || '#111722' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${branding.button_color || '#9b87f5'}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  const sidebarBg = branding.sidebar_background || '#1f293d';
  const sidebarText = '#ffffff';
  const bg = branding.background_color || '#111722';
  const textColor = branding.text_color || '#ffffff';
  const buttonColor = branding.button_color || '#9b87f5';
  const logo = branding.logo_url;
  const companyName = branding.company_name || 'Minha Empresa';

  const isActive = (url: string) =>
    location.pathname === url || location.pathname.startsWith(url + '/');

  const handleLogout = () => {
    clearResellerToken();
    navigate('/revendedora/login', { replace: true });
  };

  // ===== MOBILE LAYOUT =====
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: bg, color: textColor }}>
        {/* Mobile Header */}
        <header style={{
          backgroundColor: sidebarBg,
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}>
          {/* Logo */}
          <div>
            {logo
              ? <img src={logo} alt={companyName} style={{ height: 32, objectFit: 'contain', borderRadius: 4 }} />
              : <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Building2 style={{ width: 22, height: 22, color: sidebarText }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: sidebarText }}>{companyName}</span>
                </div>
            }
          </div>
          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <NotificationBell />
            <button
              onClick={() => navigate('/revendedora/reseller/settings')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: `${sidebarText}cc`, padding: 8, borderRadius: 8 }}
              title="Configura\u00e7\u00f5es"
            >
              <Settings style={{ width: 18, height: 18 }} />
            </button>
            <button
              onClick={handleLogout}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: `${sidebarText}cc`, padding: 8, borderRadius: 8 }}
              title="Sair"
            >
              <LogOut style={{ width: 18, height: 18 }} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: '16px', paddingBottom: 80, overflow: 'auto' }}>
          {children}
        </main>

        {/* Bottom Nav */}
        <nav style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 60,
          backgroundColor: sidebarBg,
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 50,
        }}>
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.url);
            return (
              <button
                key={item.url}
                onClick={() => { if ('vibrate' in navigator) navigator.vibrate(10); navigate(item.url); }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  borderRadius: 8,
                  backgroundColor: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                  minWidth: 52,
                }}
              >
                <Icon style={{ width: 20, height: 20, color: active ? '#ffffff' : 'rgba(255,255,255,0.55)' }} />
                <span style={{ fontSize: 9, color: active ? '#ffffff' : 'rgba(255,255,255,0.55)', fontWeight: active ? 600 : 400 }}>
                  {item.title}
                </span>
              </button>
            );
          })}
        </nav>

        <ChatWidget />
      </div>
    );
  }

  // ===== DESKTOP LAYOUT (sidebar) =====
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: bg, color: textColor }}>
      <AppHeader
        companyName={companyName}
        companyLogo={logo}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', overflow: 'auto' }}>
        <main style={{ flex: 1, padding: '24px' }}>
          {children}
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}

export function ResellerLayout({ children }: ResellerLayoutProps) {
  return (
    <SupabaseProvider>
      <ResellerLayoutContent>{children}</ResellerLayoutContent>
    </SupabaseProvider>
  );
}
