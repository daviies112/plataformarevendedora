import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { LogIn, Shield } from 'lucide-react';
import { saveResellerToken, saveProjectName, saveResellerId, saveResellerEmail } from '../lib/resellerAuth';
import { useCompany } from '../contexts/CompanyContext';

// Clareia um hex em ~20% de luminosidade para o fundo dos inputs
function lightenHex(hex: string, amount = 20): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
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
  const newL = Math.min(1, l + amount / 100);
  const hsl2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q2 = newL < 0.5 ? newL * (1 + s) : newL + s - newL * s;
  const p2 = 2 * newL - q2;
  const nr = Math.round(hsl2rgb(p2, q2, h + 1/3) * 255);
  const ng = Math.round(hsl2rgb(p2, q2, h) * 255);
  const nb2 = Math.round(hsl2rgb(p2, q2, h - 1/3) * 255);
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb2.toString(16).padStart(2, '0')}`;
}

function formatCPF(value: string): string {
  const numbers = value.replace(/\D/g, '').slice(0, 11);
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
  if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
  return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`;
}

export default function Login() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { companySlug } = useParams<{ companySlug?: string }>();
  const { branding, brandingLoading, loadBrandingBySlug } = useCompany();
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  // tenant_id resolvido pelo slug (null = modo generico / sem slug na URL)
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(null);
  const [slugError, setSlugError] = useState(false);

  // Se houver companySlug na URL, carregar branding da empresa antes do login
  useEffect(() => {
    if (!companySlug) return;
    loadBrandingBySlug(companySlug).then((tenantId) => {
      if (tenantId) {
        setResolvedTenantId(tenantId);
        setSlugError(false);
      } else {
        setSlugError(true);
      }
    });
  }, [companySlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carregar credenciais salvas ao montar
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nexus_remember_me');
      if (saved) {
        const { email: savedEmail, cpf: savedCpf } = JSON.parse(saved);
        if (savedEmail) setEmail(savedEmail);
        if (savedCpf) setCpf(savedCpf);
        setRememberMe(true);
      }
    } catch (_) {}
  }, []);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpf(formatCPF(e.target.value));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const cpfNumbers = cpf.replace(/\D/g, '');

    try {
      // Montar body: incluir tenant_id resolvido pelo slug quando disponivel
      // Isso permite que o backend restrinja o login ao tenant correto mesmo que
      // o host nao seja um subdominio dedicado (ex: nexusemijoiasrevendedoras.nexusintelligence.tech)
      const loginBody: Record<string, string> = { email, cpf: cpfNumbers };
      if (resolvedTenantId) {
        loginBody.tenantId = resolvedTenantId;
      }
      if (companySlug) {
        loginBody.companySlug = companySlug;
      }

      const response = await fetch('/api/reseller/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(loginBody),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Erro ao fazer login');
        return;
      }

      if (data.success) {
        if (data.token) saveResellerToken(data.token);
        if (data.tenant?.projectName) saveProjectName(data.tenant.projectName);
        if (data.user?.id) saveResellerId(data.user.id);
        if (data.user?.email) saveResellerEmail(data.user.email);
        await queryClient.invalidateQueries({ queryKey: ['/api/reseller/supabase-config'] });
        await queryClient.invalidateQueries({ queryKey: ['/api/reseller/settings'] });
        if (rememberMe) {
          try { localStorage.setItem('nexus_remember_me', JSON.stringify({ email, cpf })); } catch (_) {}
        } else {
          try { localStorage.removeItem('nexus_remember_me'); } catch (_) {}
        }
        toast.success('Login realizado com sucesso!');
        navigate('/revendedora/reseller/dashboard');
      }
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const hasCustomBranding = (
    branding.button_color !== '#9b87f5' ||
    (branding.card_color !== null && branding.card_color !== '#1a1a2e') ||
    branding.background_color !== '#ffffff' ||
    branding.sidebar_background !== '#1a1a1a'
  );

  const inputBg = hasCustomBranding && branding.card_color
    ? lightenHex(branding.card_color, 20)
    : undefined;

  // Empresa nao encontrada (slug invalido na URL)
  if (companySlug && slugError && !brandingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f8f8f8' }}>
        <div className="text-center space-y-4 max-w-sm">
          <Shield className="w-14 h-14 mx-auto text-muted-foreground opacity-40" />
          <h2 className="text-xl font-semibold text-foreground">Empresa não encontrada</h2>
          <p className="text-muted-foreground text-sm">
            O link que você acessou não corresponde a nenhuma empresa cadastrada.
          </p>
        </div>
      </div>
    );
  }

  if (brandingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="login-loading">
        <div className="animate-pulse space-y-4 w-full max-w-md px-4">
          <div className="h-16 bg-muted rounded-md mx-auto w-32" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: branding.background_color || '#ffffff' }}
      data-testid="login-page"
    >
      <div className="w-full max-w-md space-y-6">
        {branding.logo_url && (
          <div className="flex justify-center" data-testid="login-logo-container">
            <img
              src={branding.logo_url}
              alt={branding.company_name || 'Logo'}
              className="object-contain"
              style={{
                height: branding.logo_size === 'small' ? 48 : branding.logo_size === 'large' ? 120 : 80,
              }}
              data-testid="img-login-logo"
            />
          </div>
        )}

        <div className="w-full rounded-lg border shadow-sm" style={{ backgroundColor: branding.card_color || '#1a1a2e' }}>
          <CardHeader className="text-center">
            {!branding.logo_url && (
              <div className="flex justify-center mb-3">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: branding.button_color }}
                  data-testid="login-icon-container"
                >
                  <Shield className="w-7 h-7" style={{ color: branding.button_text_color }} />
                </div>
              </div>
            )}
            <CardTitle
              className="text-2xl font-bold"
              style={hasCustomBranding ? { color: branding.heading_color } : undefined}
              data-testid="text-login-title"
            >
              {branding.company_name || 'Plataforma de Revendedores'}
            </CardTitle>
            <CardDescription
              style={hasCustomBranding ? { color: `${branding.text_color}99` } : undefined}
            >
              Faça login para acessar a plataforma
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" style={hasCustomBranding ? { color: branding.text_color } : undefined}>
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  data-testid="input-email"
                  style={inputBg ? { backgroundColor: inputBg, color: branding.text_color, borderColor: `${branding.text_color}30` } : undefined}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpf" style={hasCustomBranding ? { color: branding.text_color } : undefined}>
                  CPF
                </Label>
                <Input
                  id="cpf"
                  type="text"
                  value={cpf}
                  onChange={handleCpfChange}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  required
                  data-testid="input-cpf"
                  style={inputBg ? { backgroundColor: inputBg, color: branding.text_color, borderColor: `${branding.text_color}30` } : undefined}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: branding.button_color || '#9b87f5' }}
                  data-testid="checkbox-remember-me"
                />
                <Label
                  htmlFor="remember-me"
                  style={{ cursor: 'pointer', fontSize: 13, color: hasCustomBranding ? `${branding.text_color}cc` : undefined }}
                >
                  Lembrar de mim
                </Label>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                style={hasCustomBranding ? {
                  backgroundColor: branding.button_color,
                  color: branding.button_text_color,
                  borderColor: branding.button_color,
                } : undefined}
                data-testid="button-login"
              >
                <LogIn className="h-4 w-4 mr-2" />
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>
          </CardContent>
        </div>
      </div>
    </div>
  );
}
