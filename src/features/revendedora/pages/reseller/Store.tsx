import { useState, useEffect, useRef } from 'react';
import { useSupabase } from '@/features/revendedora/contexts/SupabaseContext';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/features/revendedora/components/ui/card';
import {
  Globe, Copy, Check, MessageCircle, ExternalLink,
  User, Phone, Instagram, FileText, Award, Camera,
  Loader2, Save, Info
} from 'lucide-react';
import { Button } from '@/features/revendedora/components/ui/button';
import { toast } from 'sonner';
import { getResellerId as getStoredResellerId, resellerFetch } from '@/features/revendedora/lib/resellerAuth';
import { useCompany } from '@/features/revendedora/contexts/CompanyContext';
import { Input } from '@/features/revendedora/components/ui/input';
import { Label } from '@/features/revendedora/components/ui/label';
import { Textarea } from '@/features/revendedora/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/features/revendedora/components/ui/avatar';
import { Switch } from '@/features/revendedora/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogClose,
} from '@/features/revendedora/components/ui/dialog';
import { useResellerProfile } from '@/hooks/useResellerProfile';

export default function Store() {
  const { loading: supabaseLoading, configured } = useSupabase();
  const { branding } = useCompany();
  const accent = branding.button_color || '#954728';

  const [storeSlug, setStoreSlug] = useState('');
  const [urlCopied, setUrlCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const { profile, loading: profileLoading, saving: profileSaving, uploading, saveProfile, uploadProfilePhoto } =
    useResellerProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    profile_photo_url: '',
    phone: '',
    instagram_handle: '',
    bio: '',
    show_career_level: false,
  });

  useEffect(() => {
    if (profile) setFormData({
      profile_photo_url: profile.profile_photo_url || '',
      phone: profile.phone || '',
      instagram_handle: profile.instagram_handle || '',
      bio: profile.bio || '',
      show_career_level: profile.show_career_level ?? false,
    });
  }, [profile]);

  // Carregar apenas o slug da loja (somente leitura)
  useEffect(() => {
    if (!supabaseLoading && configured) loadSlug();
  }, [supabaseLoading, configured]);

  const loadSlug = async () => {
    const resellerId = getStoredResellerId();
    if (!resellerId) return;
    try {
      const res = await resellerFetch('/api/reseller/store-config');
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (result.success && result.data?.store_slug) {
        setStoreSlug(result.data.store_slug);
      } else {
        setStoreSlug(resellerId);
      }
    } catch {
      setStoreSlug(getStoredResellerId() || '');
    }
  };

  const getPublicUrl = () => {
    const id = storeSlug || getStoredResellerId() || '';
    return `${window.location.origin}/loja/${id}`;
  };

  const copyPublicUrl = () => {
    navigator.clipboard.writeText(getPublicUrl());
    setUrlCopied(true);
    toast.success('Link copiado!');
    setTimeout(() => setUrlCopied(false), 2000);
  };

  const shareOnWhatsApp = () => {
    const msg = encodeURIComponent(`Confira minha loja!\n${getPublicUrl()}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  const formatPhone = (v: string) => {
    const n = v.replace(/\D/g, '');
    if (n.length <= 2) return n;
    if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
    return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7, 11)}`;
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Foto deve ter no máximo 5MB'); return; }
    const url = await uploadProfilePhoto(file);
    if (url) { setFormData(prev => ({ ...prev, profile_photo_url: url })); toast.success('Foto atualizada!'); }
  };

  if (supabaseLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
  if (!configured) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-muted-foreground">Supabase não configurado</p>
    </div>
  );

  return (
    <div className="space-y-5 pb-10">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold">Minha Loja</h1>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Compartilhe sua vitrine e gerencie seu perfil público
        </p>
      </div>

      {/* ===== AVISO: personalização é da empresa ===== */}
      <div
        className="flex items-start gap-3 p-3 rounded-lg border text-sm"
        style={{ borderColor: `${accent}40`, background: `${accent}12` }}
      >
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: accent }} />
        <p style={{ color: 'rgba(255,255,255,0.75)' }}>
          O nome, visual, produtos e configurações da loja são definidos pela empresa.
          Aqui você gerencia seu perfil pessoal e compartilha o link com seus clientes.
        </p>
      </div>

      {/* ===== 1. MINHA VITRINE ===== */}
      <Card style={{ borderColor: `${accent}50` }}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" style={{ color: accent }} />
            Minha Vitrine
          </CardTitle>
          <CardDescription>Link da sua loja para compartilhar com clientes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* URL + botões */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div
              className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-mono truncate"
              style={{ borderColor: `${accent}30`, background: 'rgba(0,0,0,0.25)', color: 'rgba(255,255,255,0.75)' }}
            >
              <Globe className="h-3.5 w-3.5 flex-shrink-0" style={{ color: accent }} />
              <span className="truncate">{getPublicUrl()}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={copyPublicUrl} className="gap-1.5">
                {urlCopied
                  ? <><Check className="h-3.5 w-3.5 text-green-500" />Copiado!</>
                  : <><Copy className="h-3.5 w-3.5" />Copiar</>}
              </Button>
              <Button size="sm" variant="outline" onClick={shareOnWhatsApp} className="gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" />WhatsApp
              </Button>
              <Button
                size="sm"
                onClick={() => window.open(getPublicUrl(), '_blank')}
                className="gap-1.5"
                style={{ backgroundColor: accent, borderColor: accent }}
              >
                <ExternalLink className="h-3.5 w-3.5" />Abrir Loja
              </Button>
            </div>
          </div>

          {/* Botão compartilhar */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowShareModal(true)}
            className="gap-2"
            style={{ borderColor: `${accent}40`, color: 'rgba(255,255,255,0.8)' }}
          >
            <Globe className="h-3.5 w-3.5" style={{ color: accent }} />
            Ver QR Code e compartilhar
          </Button>

        </CardContent>
      </Card>

      {/* ===== 2. MEU PERFIL ===== */}
      <Card style={{ borderColor: `${accent}30` }}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" style={{ color: accent }} />
            Meu Perfil
          </CardTitle>
          <CardDescription>Foto e contato que aparecem na sua loja pública</CardDescription>
        </CardHeader>
        <CardContent>
          {profileLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <form
              onSubmit={async e => { e.preventDefault(); await saveProfile(formData); }}
              className="space-y-4"
            >
              {/* Foto + contatos */}
              <div className="flex items-center gap-4">
                <div className="relative group flex-shrink-0">
                  <Avatar className="h-20 w-20 border-2" style={{ borderColor: `${accent}40` }}>
                    <AvatarImage src={formData.profile_photo_url} />
                    <AvatarFallback className="text-2xl"><User className="h-8 w-8" /></AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {uploading
                      ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                      : <Camera className="h-5 w-5 text-white" />}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <Phone className="h-3 w-3" />Celular / WhatsApp
                    </Label>
                    <Input
                      placeholder="(00) 00000-0000"
                      value={formData.phone}
                      onChange={e => setFormData(p => ({ ...p, phone: formatPhone(e.target.value) }))}
                      maxLength={16}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <Instagram className="h-3 w-3" />Instagram
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                      <Input
                        placeholder="seu_perfil"
                        value={formData.instagram_handle}
                        onChange={e => setFormData(p => ({
                          ...p,
                          instagram_handle: e.target.value.replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '')
                        }))}
                        className="pl-7 h-9"
                        maxLength={30}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bio */}
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <FileText className="h-3 w-3" />Sobre mim
                </Label>
                <Textarea
                  placeholder="Conte um pouco sobre você..."
                  value={formData.bio}
                  onChange={e => setFormData(p => ({ ...p, bio: e.target.value }))}
                  rows={3}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground text-right">{formData.bio.length}/500</p>
              </div>

              {/* Nível de carreira */}
              <div
                className="flex items-center justify-between p-3 rounded-lg border"
                style={{ borderColor: `${accent}20` }}
              >
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4" style={{ color: accent }} />
                  <div>
                    <p className="text-sm font-medium">Exibir nível de carreira</p>
                    <p className="text-xs text-muted-foreground">Mostrar sua faixa de vendas na loja</p>
                  </div>
                </div>
                <Switch
                  checked={formData.show_career_level}
                  onCheckedChange={v => setFormData(p => ({ ...p, show_career_level: v }))}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={profileSaving || uploading}
                  size="sm"
                  style={{ backgroundColor: accent, borderColor: accent }}
                >
                  {profileSaving
                    ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Salvando...</>
                    : <><Save className="h-3.5 w-3.5 mr-2" />Salvar Perfil</>}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Modal QR Code + compartilhar */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />Compartilhar Loja
            </DialogTitle>
            <DialogDescription>Compartilhe o link ou QR Code com seus clientes</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 border rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Link da sua loja</p>
              <p className="text-sm font-mono break-all">{getPublicUrl()}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={copyPublicUrl} className="gap-2">
                {urlCopied
                  ? <><Check className="h-4 w-4 text-green-500" />Copiado!</>
                  : <><Copy className="h-4 w-4" />Copiar Link</>}
              </Button>
              <Button variant="outline" onClick={shareOnWhatsApp} className="gap-2">
                <MessageCircle className="h-4 w-4" />WhatsApp
              </Button>
            </div>
            <Button
              className="w-full"
              onClick={() => window.open(getPublicUrl(), '_blank')}
              style={{ backgroundColor: accent }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />Abrir Minha Loja
            </Button>
            <div className="flex justify-center p-3 border rounded-lg bg-white">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(getPublicUrl())}`}
                alt="QR Code"
                className="w-40 h-40"
              />
            </div>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" className="w-full">Fechar</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>

    </div>
  );
}
