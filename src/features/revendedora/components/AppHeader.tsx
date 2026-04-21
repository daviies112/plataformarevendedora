import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Store, TrendingUp, Wallet,
  Trophy, UsersRound, Settings, LogOut, Building2,
} from 'lucide-react';
import { clearResellerToken } from '@/features/revendedora/lib/resellerAuth';
import { useCompany } from '@/features/revendedora/contexts/CompanyContext';
import { NotificationBell } from '@/components/NotificationBell';

const resellerItems = [
  { title: 'Dashboard', url: '/revendedora/reseller/dashboard', icon: LayoutDashboard },
  { title: 'Vendas', url: '/revendedora/reseller/sales', icon: TrendingUp },
  { title: 'Financeiro', url: '/revendedora/reseller/financial', icon: Wallet },
  { title: 'Minha Loja', url: '/revendedora/reseller/store', icon: Store },
  { title: 'Gamificação', url: '/revendedora/reseller/gamification', icon: Trophy },
  { title: 'Equipe', url: '/revendedora/reseller/team', icon: UsersRound },
  { title: 'Configurações', url: '/revendedora/reseller/settings', icon: Settings },
];

interface AppHeaderProps {
  companyName?: string;
  companyLogo?: string | null;
  type?: string;
}

export function AppHeader({ companyName = 'Minha Empresa', companyLogo, type }: AppHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { branding } = useCompany();

  const sidebarBg = branding.sidebar_background || '#4e3b3b';
  const accent = branding.button_color || '#954728';
  const textInactive = 'rgba(255,255,255,0.75)';

  const isActive = (url: string) =>
    location.pathname === url || location.pathname.startsWith(url + '/');

  const handleLogout = () => {
    clearResellerToken();
    navigate('/revendedora/login', { replace: true });
  };

  return (
    <aside style={{
      backgroundColor: sidebarBg,
      width: 210,
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>

      {/* Logo */}
      <div style={{
        padding: '18px 16px 14px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {companyLogo ? (
          <img src={companyLogo} alt={companyName}
            style={{ height: 44, objectFit: 'contain', borderRadius: 6 }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 style={{ width: 26, height: 26, color: accent }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>{companyName}</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {resellerItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.url);
          return (
            <NavLink
              key={item.url}
              to={item.url}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                backgroundColor: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: active ? accent : textInactive,
                textDecoration: 'none',
                transition: 'all 0.15s',
                borderLeft: active ? `3px solid ${accent}` : '3px solid transparent',
              }}
              onMouseEnter={e => {
                if (!active) {
                  const el = e.currentTarget as HTMLElement;
                  el.style.backgroundColor = 'rgba(255,255,255,0.07)';
                  el.style.color = '#ffffff';
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  const el = e.currentTarget as HTMLElement;
                  el.style.backgroundColor = 'transparent';
                  el.style.color = textInactive;
                }
              }}
            >
              <Icon style={{ width: 16, height: 16, flexShrink: 0, color: active ? accent : textInactive }} />
              {item.title}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <NotificationBell />
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            flex: 1, padding: '7px 10px', borderRadius: 8,
            background: 'none', border: 'none', cursor: 'pointer',
            color: textInactive, fontSize: 13, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.backgroundColor = 'rgba(255,255,255,0.07)'; el.style.color = '#ffffff'; }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.backgroundColor = 'transparent'; el.style.color = textInactive; }}
        >
          <LogOut style={{ width: 14, height: 14 }} />
          Sair
        </button>
      </div>
    </aside>
  );
}
