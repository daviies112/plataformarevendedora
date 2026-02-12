import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Crown,
  Wallet,
  ShoppingBag,
  Trophy,
  Users,
  Settings
} from "lucide-react";
import { WalletBadge } from "@/components/WalletBadge";

const HeaderNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    {
      path: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      active: location.pathname === "/dashboard"
    },
    {
      path: "/vendas",
      label: "Vendas",
      icon: Crown,
      active: location.pathname.startsWith("/vendas") && !location.pathname.startsWith("/vendas/gamification")
    },
    {
      path: "/financeiro",
      label: "Financeiro",
      icon: Wallet,
      active: location.pathname === "/financeiro"
    },
    {
      path: "/revendedora",
      label: "Minha Loja",
      icon: ShoppingBag,
      active: location.pathname.startsWith("/revendedora")
    },
    {
      path: "/vendas/gamification",
      label: "Gamificação",
      icon: Trophy,
      active: location.pathname === "/vendas/gamification"
    },
    {
      path: "/equipe",
      label: "Equipe",
      icon: Users,
      active: location.pathname === "/equipe"
    },
    {
      path: "/settings",
      label: "Configurações",
      icon: Settings,
      active: location.pathname === "/settings"
    }
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-xl border-b border-white/10">
      <div className="w-full px-2 sm:px-4">
        <div className="flex items-center h-16 gap-2">
          {/* Navigation with horizontal scroll */}
          <nav className="flex items-center space-x-1 overflow-x-auto scrollbar-hide flex-1 min-w-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant={item.active ? "default" : "ghost"}
                size="sm"
                onClick={() => navigate(item.path)}
                className={`h-10 px-3 whitespace-nowrap flex-shrink-0 hover:bg-transparent hover:text-inherit ${item.active ? '!bg-primary !text-black' : 'text-gray-400 hover:text-white'}`}
              >
                <item.icon className="w-4 h-4 mr-1.5" />
                {item.label}
              </Button>
            ))}
          </nav>

          {/* Wallet Balance & Settings */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <WalletBadge />
            <Button
              onClick={() => navigate("/settings")}
              variant={location.pathname === "/settings" ? "default" : "ghost"}
              size="icon"
              className={`h-10 w-10 hover:bg-transparent hover:text-inherit ${location.pathname === "/settings" ? '!bg-primary !text-black' : 'text-gray-400 hover:text-white'}`}
              title="Configurações"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default HeaderNavigation;