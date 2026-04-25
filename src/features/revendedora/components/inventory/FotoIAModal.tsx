import { useState, useRef, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/features/revendedora/components/ui/dialog';
import { Button } from '@/features/revendedora/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/features/revendedora/components/ui/select';
import { Loader2, Sparkles, Upload, CheckCircle, XCircle, ImageIcon, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useSupabase } from '@/features/revendedora/contexts/SupabaseContext';

const WEBHOOK_URL = 'https://n8n.nexusintelligence.tech/webhook/fotos-v2';
const ACCEPTED_TYPES = ['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/avif'];
const HEIC_TYPES = ['image/heic','image/heif','image/heic-sequence'];

interface Ajustes {
  brilho: number;     // 0-200 (100=normal)
  contraste: number;  // 0-200
  saturacao: number;  // 0-200
  nitidez: number;    // 0-10 (blur negativo)
  virado: number;     // rotacao 0/90/180/270
}

const AJUSTES_PADRAO: Ajustes = { brilho: 100, contraste: 100, saturacao: 100, nitidez: 0, virado: 0 };

interface FotoIAModalProps {
  product: { id: string; description: string | null; image: string | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (novaUrl: string) => void;
}

async function convertHeicToJpeg(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas nao disponivel')); return; }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('Conversao falhou')); return; }
          const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
          resolve(new File([blob], newName, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.95);
      };
      img.onerror = () => reject(new Error('Imagem invalida'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Leitura falhou'));
    reader.readAsDataURL(file);
  });
}

function cssFilter(a: Ajustes): string {
  const blur = a.nitidez < 0 ? `blur(${Math.abs(a.nitidez) * 0.3}px)` : '';
  const sharp = a.nitidez > 0 ? `contrast(${100 + a.nitidez * 5}%)` : '';
  return `brightness(${a.brilho}%) contrast(${a.contraste}%) saturate(${a.saturacao}%) ${blur}${sharp}`.trim();
}

function SliderAjuste({ label, value, min, max, onChange, resetValue }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; resetValue: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <div className="flex items-center gap-1">
          <span className="text-xs tabular-nums w-8 text-right">{value > 100 ? '+' : ''}{value - resetValue === 0 ? '0' : value > resetValue ? '+' + (value - resetValue) : value - resetValue}</span>
          {value !== resetValue && (
            <button onClick={() => onChange(resetValue)} className="text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 accent-purple-500 cursor-pointer"
      />
    </div>
  );
}

export function FotoIAModal({ product, open, onOpenChange, onSaved }: FotoIAModalProps) {
  const { client: supabase } = useSupabase();
  const [loading, setLoading] = useState(false);
  const [fotoOriginalUrl, setFotoOriginalUrl] = useState<string | null>(null);
  const [fotoMelhoradaUrl, setFotoMelhoradaUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [template, setTemplate] = useState('auto');
  const [isDragging, setIsDragging] = useState(false);
  const [showAjustes, setShowAjustes] = useState(false);
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_PADRAO);
  const [abaAtiva, setAbaAtiva] = useState<'ia' | 'manual'>('ia');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const setAjuste = (key: keyof Ajustes) => (v: number) =>
    setAjustes(prev => ({ ...prev, [key]: v }));

  const resetAjustes = () => setAjustes(AJUSTES_PADRAO);

  const processFile = async (file: File) => {
    if (!supabase) return;
    let finalFile = file;
    const isHeic = HEIC_TYPES.includes(file.type.toLowerCase()) || /\.(heic|heif)$/i.test(file.name);
    if (isHeic) {
      setStatusMsg('Convertendo HEIC para JPEG...');
      try { finalFile = await convertHeicToJpeg(file); }
      catch (err: any) {
        setErro('Nao foi possivel converter HEIC: ' + err.message + '. Use JPG ou PNG.');
        setStatusMsg('');
        return;
      }
    } else if (!ACCEPTED_TYPES.includes(file.type.toLowerCase())) {
      setErro('Formato nao suportado: ' + (file.type || 'desconhecido') + '. Use JPG, PNG ou WebP.');
      return;
    }
    setUploadingFile(true); setErro(null); setFotoMelhoradaUrl(null); setStatusMsg('Enviando imagem...');
    try {
      const ext = finalFile.name.split('.').pop() || 'jpg';
      const fileName = 'temp_ai_' + (product?.id || 'anonimo') + '_' + Date.now() + '.' + ext;
      const { error: upErr } = await supabase.storage.from('produtos').upload(fileName, finalFile, {
        upsert: true, contentType: finalFile.type || 'image/jpeg'
      });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = supabase.storage.from('produtos').getPublicUrl(fileName);
      setFotoOriginalUrl(urlData.publicUrl);
      setStatusMsg('');
      toast.success('Foto carregada!');
    } catch (err: any) {
      setErro('Erro no upload: ' + err.message);
    } finally { setUploadingFile(false); setStatusMsg(''); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  }, [supabase, product]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const handleUsarFotoAtual = () => {
    if (!product?.image) return;
    setFotoOriginalUrl(product.image); setFotoMelhoradaUrl(null); setErro(null); setStatusMsg('');
    toast.success('Usando foto atual do produto.');
  };

  const iniciarPolling = (userId: string, fotoOriginal: string) => {
    let tentativas = 0;
    const maxTentativas = 25;
    setStatusMsg('Processando com IA...');
    pollRef.current = setInterval(async () => {
      tentativas++;
      if (tentativas > maxTentativas) {
        stopPolling(); setLoading(false);
        setErro('Timeout: processamento demorou mais de 50s. Tente novamente.');
        setStatusMsg('');
        return;
      }
      setStatusMsg('Processando com IA... ' + (tentativas * 2) + 's');
      try {
        if (!supabase) return;
        const { data } = await supabase
          .from('imagens_gratis')
          .select('foto_melhorada_url,status')
          .eq('user_id', userId)
          .eq('foto_original_url', fotoOriginal)
          .eq('status', 'concluido')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (data?.foto_melhorada_url) {
          stopPolling();
          setFotoMelhoradaUrl(data.foto_melhorada_url);
          setLoading(false); setStatusMsg('');
          toast.success('Imagem processada!');
        }
      } catch (_) {}
    }, 2000);
  };

  const handleGerar = async () => {
    if (!fotoOriginalUrl) { toast.error('Selecione uma foto primeiro'); return; }
    setLoading(true); setErro(null); setFotoMelhoradaUrl(null);
    const userId = product?.id || 'anonimo';
    try {
      fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'melhorar', foto_original_url: fotoOriginalUrl, user_id: userId, template_id: template })
      }).catch(() => {});
      await new Promise(r => setTimeout(r, 1500));
      iniciarPolling(userId, fotoOriginalUrl);
    } catch (err: any) {
      setLoading(false);
      setErro('Erro ao iniciar: ' + err.message);
    }
  };

  const handleUsarImagem = async () => {
    if (!fotoMelhoradaUrl || !product || !supabase) return;
    try {
      onSaved?.(fotoMelhoradaUrl);
      toast.success('Imagem salva no produto!');
      handleClose();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    }
  };

  const handleClose = () => {
    stopPolling();
    setFotoOriginalUrl(null); setFotoMelhoradaUrl(null);
    setErro(null); setLoading(false); setStatusMsg(''); setUploadingFile(false);
    setAjustes(AJUSTES_PADRAO); setShowAjustes(false);
    onOpenChange(false);
  };

  const temAjustesAtivos = JSON.stringify(ajustes) !== JSON.stringify(AJUSTES_PADRAO);
  const imagemParaMostrar = abaAtiva === 'manual' ? fotoOriginalUrl : fotoMelhoradaUrl;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Melhorar Foto com IA
          </DialogTitle>
          <DialogDescription>
            Envie uma foto, deixe a IA gerar ou ajuste manualmente como no Instagram.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">

          {/* Upload */}
          <div
            className={"border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors " + (isDragging ? 'border-purple-400 bg-purple-50' : 'border-muted hover:border-purple-300')}
            onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadingFile ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                <span className="text-sm text-muted-foreground">{statusMsg || 'Enviando...'}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 py-2">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium">Arraste ou clique para enviar</span>
                <span className="text-xs text-muted-foreground">JPG, PNG, WebP, HEIC (iPhone)</span>
              </div>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={handleFileChange} />

          {product?.image && !fotoOriginalUrl && (
            <Button variant="outline" className="w-full" onClick={handleUsarFotoAtual} disabled={uploadingFile}>
              <ImageIcon className="mr-2 h-4 w-4" />
              Usar foto atual do produto
            </Button>
          )}

          {/* Abas: IA / Manual */}
          {fotoOriginalUrl && (
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setAbaAtiva('ia')}
                className={"flex-1 py-2 text-sm font-medium transition-colors " + (abaAtiva === 'ia' ? 'bg-purple-600 text-white' : 'bg-muted hover:bg-muted/80 text-muted-foreground')}
              >
                <Sparkles className="inline h-3.5 w-3.5 mr-1" />IA Profissional
              </button>
              <button
                onClick={() => setAbaAtiva('manual')}
                className={"flex-1 py-2 text-sm font-medium transition-colors " + (abaAtiva === 'manual' ? 'bg-purple-600 text-white' : 'bg-muted hover:bg-muted/80 text-muted-foreground')}
              >
                <SlidersHorizontal className="inline h-3.5 w-3.5 mr-1" />Ajuste Manual
                {temAjustesAtivos && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />}
              </button>
            </div>
          )}

          {/* Aba IA */}
          {fotoOriginalUrl && abaAtiva === 'ia' && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estilo visual</label>
                <Select value={template} onValueChange={setTemplate}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">🤖 Auto (IA escolhe)</SelectItem>
                    <SelectItem value="ecommerce_branco">⬜ Fundo Branco E-commerce</SelectItem>
                    <SelectItem value="natural_suave">🌿 Natural Suave</SelectItem>
                    <SelectItem value="premium_escuro">⬛ Premium Escuro</SelectItem>
                    <SelectItem value="luxury_gold">✨ Luxury Gold</SelectItem>
                    <SelectItem value="vibrante_social">🎨 Vibrante Social</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Original</p>
                  <div className="aspect-square rounded-lg border bg-muted overflow-hidden">
                    <img src={fotoOriginalUrl} alt="Original" className="w-full h-full object-cover" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resultado IA</p>
                  <div className="aspect-square rounded-lg border bg-muted overflow-hidden flex items-center justify-center">
                    {loading ? (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground p-4 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                        <span className="text-xs">{statusMsg || 'Processando...'}</span>
                      </div>
                    ) : fotoMelhoradaUrl ? (
                      <img src={fotoMelhoradaUrl} alt="Resultado IA" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Sparkles className="h-8 w-8" />
                        <span className="text-xs text-center">Clique em Gerar</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Aba Manual — sliders estilo Instagram */}
          {fotoOriginalUrl && abaAtiva === 'manual' && (
            <div className="space-y-4">
              <div className="aspect-square rounded-lg border bg-black overflow-hidden relative">
                <img
                  src={fotoOriginalUrl}
                  alt="Ajuste manual"
                  className="w-full h-full object-contain transition-all duration-100"
                  style={{ filter: cssFilter(ajustes) }}
                />
                {temAjustesAtivos && (
                  <button
                    onClick={resetAjustes}
                    className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 hover:bg-black/80"
                  >
                    <RotateCcw className="h-3 w-3" /> Resetar
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 px-1">
                <SliderAjuste label="☀️ Brilho" value={ajustes.brilho} min={0} max={200} resetValue={100} onChange={setAjuste('brilho')} />
                <SliderAjuste label="🎛️ Contraste" value={ajustes.contraste} min={0} max={200} resetValue={100} onChange={setAjuste('contraste')} />
                <SliderAjuste label="🎨 Saturação" value={ajustes.saturacao} min={0} max={200} resetValue={100} onChange={setAjuste('saturacao')} />
                <SliderAjuste label="🔍 Nitidez" value={ajustes.nitidez} min={-5} max={10} resetValue={0} onChange={setAjuste('nitidez')} />
              </div>
            </div>
          )}

          {erro && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {fotoMelhoradaUrl && abaAtiva === 'ia' && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>Imagem processada! Clique em Usar para salvar.</span>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={handleClose} className="flex-1">Cancelar</Button>

          {abaAtiva === 'ia' && (
            !fotoMelhoradaUrl ? (
              <Button onClick={handleGerar} disabled={!fotoOriginalUrl || loading || uploadingFile} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white">
                {loading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando...</>
                  : <><Sparkles className="mr-2 h-4 w-4" />Gerar com IA</>}
              </Button>
            ) : (
              <Button onClick={handleUsarImagem} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle className="mr-2 h-4 w-4" />Usar esta imagem
              </Button>
            )
          )}

          {abaAtiva === 'manual' && fotoOriginalUrl && (
            <Button
              onClick={() => { onSaved?.(fotoOriginalUrl!); toast.success('Foto com ajustes aplicada! (visualizacao CSS)'); handleClose(); }}
              disabled={!temAjustesAtivos}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
            >
              <CheckCircle className="mr-2 h-4 w-4" />Usar com ajustes
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
