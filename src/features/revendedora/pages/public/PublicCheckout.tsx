import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Loader2, CheckCircle, AlertCircle, ArrowLeft, Package,
  CreditCard, QrCode, Copy, Check, Banknote,
  Camera, CameraOff, FlipHorizontal, X
} from 'lucide-react';
import { toast } from 'sonner';
import { useCamera } from '@/hooks/assinatura/useCamera';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser';
import DecodeHintType from '@zxing/library/esm/core/DecodeHintType';

// ─── tipos ───────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  description: string;
  price: number;
  image?: string;
  stock?: number;
  category?: string;
  reference?: string;
}
interface StoreData {
  id: string;
  reseller_id: string;
  store_name: string;
}
interface CashProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  description?: string;
  image?: string | null;
}

// ─── beep ────────────────────────────────────────────────────────────────────
const beep = (ok: boolean) => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = ok ? 1200 : 330;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.18);
  } catch (_) {}
};

// ─── canvas preprocessing ────────────────────────────────────────────────────
const buildPreprocessedCanvases = (video: HTMLVideoElement): HTMLCanvasElement[] => {
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) return [];
  const w = video.videoWidth, h = video.videoHeight;
  const canvases: HTMLCanvasElement[] = [];

  // Variante 1: contraste alto + grayscale
  const c1 = document.createElement('canvas'); c1.width = w; c1.height = h;
  const ctx1 = c1.getContext('2d', { willReadFrequently: true })!;
  ctx1.filter = 'contrast(200%) brightness(110%) grayscale(100%)'; ctx1.drawImage(video, 0, 0); ctx1.filter = 'none';
  canvases.push(c1);

  // Variante 2: super-contraste (etiquetas desbotadas/impressao fraca)
  const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
  const ctx2 = c2.getContext('2d', { willReadFrequently: true })!;
  ctx2.filter = 'contrast(350%) brightness(120%) grayscale(100%) saturate(0%)'; ctx2.drawImage(video, 0, 0); ctx2.filter = 'none';
  canvases.push(c2);

  // Variante 3: binarizacao manual HybridBinarizer-style (threshold por bloco 32x32)
  const c3 = document.createElement('canvas'); c3.width = w; c3.height = h;
  const ctx3 = c3.getContext('2d', { willReadFrequently: true })!;
  ctx3.filter = 'grayscale(100%)'; ctx3.drawImage(video, 0, 0); ctx3.filter = 'none';
  const imageData = ctx3.getImageData(0, 0, w, h);
  const data = imageData.data;
  const BLOCK = 32;
  const cols = Math.ceil(w / BLOCK);
  const rows = Math.ceil(h / BLOCK);
  for (let br = 0; br < rows; br++) {
    for (let bc = 0; bc < cols; bc++) {
      let sum = 0, count = 0;
      const x0 = bc * BLOCK, y0 = br * BLOCK;
      const x1 = Math.min(x0 + BLOCK, w), y1 = Math.min(y0 + BLOCK, h);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += data[(y * w + x) * 4]; count++; }
      const threshold = (sum / count) * 0.85;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const idx = (y * w + x) * 4;
        const v = data[idx] < threshold ? 0 : 255;
        data[idx] = data[idx + 1] = data[idx + 2] = v;
      }
    }
  }
  ctx3.putImageData(imageData, 0, 0);
  canvases.push(c3);

  // Variante 4: invertida (barras brancas em fundo preto)
  const c4 = document.createElement('canvas'); c4.width = w; c4.height = h;
  const ctx4 = c4.getContext('2d', { willReadFrequently: true })!;
  ctx4.filter = 'contrast(300%) grayscale(100%) invert(100%)'; ctx4.drawImage(video, 0, 0); ctx4.filter = 'none';
  canvases.push(c4);

  return canvases;
};

// ─── BarcodeScanner embutido para Dinheiro ───────────────────────────────────
function CashScanner({ open, storeId, onDetected, onClose }: {
  open: boolean;
  storeId: string;
  onDetected: (product: CashProduct) => void;
  onClose: () => void;
}) {
  const { videoRef, isReady, isInitializing, error, startCamera, stopCamera, switchCamera } =
    useCamera({ facingMode: 'environment' });

  const [frameStatus, setFrameStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [engineLabel, setEngineLabel] = useState('');
  const [searching, setSearching] = useState(false);
  const nativeRef = useRef<any>(null);
  const zxingRef = useRef<BrowserMultiFormatReader | null>(null);
  const animRef = useRef<number>(0);
  const lastCodeRef = useRef<string | null>(null);
  const processingRef = useRef(false);
  const failRef = useRef(0);
  const isReadyRef = useRef(false);
  const hasNativeRef = useRef(false);

  useEffect(() => {
    if ('BarcodeDetector' in window) {
      try {
        nativeRef.current = new (window as any).BarcodeDetector({
          formats: ['ean_8','ean_13','code_128','upc_a','upc_e','qr_code','code_39','itf','data_matrix'],
        });
        hasNativeRef.current = true;
      } catch (_) {}
    }
    try {
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
        BarcodeFormat.ITF, BarcodeFormat.DATA_MATRIX, BarcodeFormat.QR_CODE,
      ]);
      zxingRef.current = new BrowserMultiFormatReader(hints);
    } catch (_) {}
  }, []);

  useEffect(() => { isReadyRef.current = isReady; }, [isReady]);

  useEffect(() => {
    if (open) {
      lastCodeRef.current = null;
      processingRef.current = false;
      failRef.current = 0;
      setFrameStatus('idle'); setMessage(''); setEngineLabel('');
      startCamera('environment');
    } else {
      stopCamera();
      cancelAnimationFrame(animRef.current);
    }
  }, [open]);

  const handleCode = useCallback(async (code: string, engine: string) => {
    processingRef.current = true;
    setSearching(true);
    setEngineLabel(engine);
    setMessage('Buscando produto...');
    try {
      const res = await fetch(`/api/public/store/${storeId}/barcode/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data.found && data.product) {
        beep(true);
        setFrameStatus('success');
        setMessage(`✅ ${data.product.name}`);
        setTimeout(() => { onDetected(data.product); }, 700);
      } else {
        beep(false);
        setFrameStatus('error');
        setMessage(`❌ Não cadastrado: ${code}`);
        setTimeout(() => {
          setFrameStatus('idle'); setMessage(''); processingRef.current = false;
        }, 2000);
      }
    } catch (_) {
      beep(false);
      setFrameStatus('error');
      setMessage('❌ Erro ao buscar produto');
      setTimeout(() => {
        setFrameStatus('idle'); setMessage(''); processingRef.current = false;
      }, 2000);
    } finally {
      setSearching(false);
    }
  }, [storeId, onDetected]);

  const detect = useCallback(async () => {
    if (!videoRef.current || !isReadyRef.current || processingRef.current) {
      animRef.current = requestAnimationFrame(detect); return;
    }
    const video = videoRef.current;
    if (video.videoWidth === 0) { animRef.current = requestAnimationFrame(detect); return; }

    let code: string | null = null;
    let engine = '';
    try {
      if (nativeRef.current) {
        try { const b = await nativeRef.current.detect(video); if (b.length) { code = b[0].rawValue; engine = 'Native'; } } catch (_) {}
      }
      // ENGINE 1b: nativo + preprocessamento (a cada 5 frames sem deteccao)
      if (!code && nativeRef.current) {
        failRef.current++;
        if (failRef.current % 5 === 0) {
          const canvases = buildPreprocessedCanvases(video);
          for (const c of canvases) {
            try { const b = await nativeRef.current.detect(c); if (b.length) { code = b[0].rawValue; engine = 'Native+Pre'; break; } } catch (_) {}
          }
        }
      } else if (!code && !nativeRef.current) {
        failRef.current++;
      }
      if (!code && zxingRef.current && failRef.current % 3 === 0) {
        const snap = document.createElement('canvas'); snap.width = video.videoWidth; snap.height = video.videoHeight;
        snap.getContext('2d', { willReadFrequently: true })!.drawImage(video, 0, 0);
        try { const r = zxingRef.current.decodeFromCanvas(snap); if (r) { code = r.getText(); engine = 'ZXing'; } } catch (_) {}
        if (!code) {
          for (const c of buildPreprocessedCanvases(video)) {
            try { const r = zxingRef.current.decodeFromCanvas(c); if (r) { code = r.getText(); engine = 'ZXing+Pre'; break; } } catch (_) {}
          }
        }
      }
      if (code) failRef.current = 0;
    } catch (_) {}

    if (code && code !== lastCodeRef.current) {
      lastCodeRef.current = code;
      await handleCode(code, engine);
      setTimeout(() => { lastCodeRef.current = null; }, 3000);
    }
    animRef.current = requestAnimationFrame(detect);
  }, [handleCode, videoRef]);

  useEffect(() => {
    if (open) { cancelAnimationFrame(animRef.current); animRef.current = requestAnimationFrame(detect); }
    return () => cancelAnimationFrame(animRef.current);
  }, [open, detect]);

  const frameColor = frameStatus === 'success' ? '#22c55e' : frameStatus === 'error' ? '#ef4444' : 'rgba(255,255,255,0.7)';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Banknote className="h-5 w-5 text-green-500" />
            Scanner — Venda em Dinheiro
          </DialogTitle>
        </DialogHeader>
        <div className="relative bg-black" style={{ height: '360px' }}>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg width="220" height="120" viewBox="0 0 220 120">
              <rect x="5" y="5" width="210" height="110" rx="10" ry="10" fill="none"
                stroke={frameColor} strokeWidth="3"
                strokeDasharray={frameStatus !== 'idle' ? '0' : '12 6'} />
            </svg>
          </div>
          {engineLabel && (
            <div className="absolute top-2 left-2 bg-black/60 text-white/60 text-[9px] px-2 py-0.5 rounded-full font-mono">{engineLabel}</div>
          )}
          {(message || searching) && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center">
              <div className="bg-black/80 text-white text-sm px-4 py-2 rounded-full flex items-center gap-2">
                {searching && <Loader2 className="h-3 w-3 animate-spin" />}
                {message}
              </div>
            </div>
          )}
          {!hasNativeRef.current && !zxingRef.current && isReady && (
            <div className="absolute top-3 left-3 right-3 bg-yellow-500/90 text-white text-xs px-3 py-2 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" /> Scanner não suportado. Use Chrome ou Edge.
            </div>
          )}
          {isInitializing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <p className="text-white text-sm">Iniciando câmera...</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
              <div className="text-center text-white">
                <CameraOff className="h-10 w-10 mx-auto mb-2 opacity-60" />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}
          <button onClick={() => switchCamera()} className="absolute top-3 right-3 bg-black/50 text-white p-2 rounded-full hover:bg-black/80 transition-colors">
            <FlipHorizontal className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-center text-muted-foreground">
            Aponte a câmera para o código de barras da peça.
          </p>
          <Button variant="outline" onClick={onClose} className="w-full" size="sm">
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function PublicCheckout() {
  const navigate = useNavigate();

  let pathname = decodeURIComponent(window.location.pathname);
  let search = window.location.search;
  let productId: string | null = null;
  let storeId: string | null = null;

  if (pathname.includes('?')) {
    const [pathPart, queryPart] = pathname.split('?');
    productId = pathPart.split('/')[2] || null;
    storeId = new URLSearchParams(queryPart).get('storeId');
  } else {
    productId = pathname.split('/')[2] || null;
    storeId = new URLSearchParams(search).get('storeId');
  }

  const [loading, setLoading] = useState(true);
  const [storeSettings, setStoreSettings] = useState<any>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [store, setStore] = useState<StoreData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'processing' | 'pix-waiting' | 'success' | 'error'>('form');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card' | 'cash'>('pix');

  // Dados cliente
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCpf, setCustomerCpf] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Cartão
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [installments, setInstallments] = useState(1);

  // PIX
  const [pixData, setPixData] = useState<{qrCode:string;qrCodeUrl:string;expiresAt:string;orderId:string} | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);

  // Dinheiro (cash)
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cashProduct, setCashProduct] = useState<CashProduct | null>(null);
  const [cashStep, setCashStep] = useState<'scan' | 'confirm' | 'success'>('scan');
  const [cashName, setCashName] = useState('');
  const [cashPhone, setCashPhone] = useState('');
  const [processingCash, setProcessingCash] = useState(false);

  useEffect(() => {
    if (productId && storeId) loadProductData();
    else { setError('Dados do produto inválidos'); setLoading(false); }
  }, [productId, storeId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === 'pix-waiting' && orderId) {
      interval = setInterval(async () => {
        try {
          const r = await fetch(`/api/public/checkout/status/${orderId}`);
          const d = await r.json();
          const paidStatuses = ['paid', 'CONFIRMED', 'RECEIVED'];
          const orderStatus = d.order?.status || '';
          const chargeStatus = d.order?.charges?.[0]?.status || '';
          if (d.success && (paidStatuses.includes(orderStatus) || paidStatuses.includes(chargeStatus))) {
            setStep('success'); clearInterval(interval);
          }
        } catch (_) {}
      }, 5000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [step, orderId]);



  // Aplicar cores do design da loja via CSS variables
  useEffect(() => {
    if (!storeSettings) return;
    const s = storeSettings;
    const root = document.documentElement;
    const h2hsl = (hex: string): string => {
      const r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
      const max=Math.max(r,g,b), min=Math.min(r,g,b);
      let h=0, sv=0, l=(max+min)/2;
      if (max!==min) { const d=max-min; sv=l>0.5?d/(2-max-min):d/(max+min);
        if(max===r)h=((g-b)/d+(g<b?6:0))/6; else if(max===g)h=((b-r)/d+2)/6; else h=((r-g)/d+4)/6; }
      return `${Math.round(h*360)} ${Math.round(sv*100)}% ${Math.round(l*100)}%`;
    };
    if (s.color_primary)      root.style.setProperty('--primary',      h2hsl(s.color_primary));
    if (s.color_background)   root.style.setProperty('--background',   h2hsl(s.color_background));
    if (s.color_surface)      root.style.setProperty('--card',         h2hsl(s.color_surface));
    if (s.color_text_primary) root.style.setProperty('--foreground',   h2hsl(s.color_text_primary));
    if (s.color_text_primary) root.style.setProperty('--card-foreground', h2hsl(s.color_text_primary));
    if (s.color_primary)      root.style.setProperty('--primary-foreground', '0 0% 5%');
    if (s.color_surface)      root.style.setProperty('--muted',        h2hsl(s.color_surface));
    if (s.color_text_secondary) root.style.setProperty('--muted-foreground', h2hsl(s.color_text_secondary));
    if (s.color_surface)      root.style.setProperty('--border',       h2hsl(s.color_surface));
    if (s.color_surface)      root.style.setProperty('--input',        h2hsl(s.color_surface));
    return () => { root.removeAttribute('style'); };
  }, [storeSettings]);

  const loadProductData = async () => {
    try {
      setLoading(true);
      const r = await fetch(`/api/public/store/${storeId}/product/${productId}`);
      const d = await r.json();
      if (!d.success) { setError(d.error || 'Produto não encontrado'); return; }
      setProduct(d.product); setStore(d.store);
      // Buscar settings de design da loja
      if (storeId) {
        try {
          const sr = await fetch(`/api/public/store/${storeId}/full`);
          if (sr.ok) {
            const sd = await sr.json();
            if (sd.settings) setStoreSettings(sd.settings);
          }
        } catch (e) { console.warn('[Checkout] settings err:', e); }
      }
    } catch (err: any) {
      setError('Erro ao carregar o produto');
    } finally { setLoading(false); }
  };

  const fmt = {
    cpf: (v: string) => v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})/,'$1-$2'),
    phone: (v: string) => { const n=v.replace(/\D/g,'').slice(0,11); return n.length<=10?n.replace(/(\d{2})(\d{4})(\d{4})/,'($1) $2-$3'):n.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3'); },
    card: (v: string) => v.replace(/\D/g,'').slice(0,16).replace(/(\d{4})(?=\d)/g,'$1 '),
    expiry: (v: string) => { const n=v.replace(/\D/g,'').slice(0,4); return n.length>=2?n.slice(0,2)+'/'+n.slice(2):n; },
    currency: (v: number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v),
  };

  const validateExpiry = (expiry: string) => {
    const parts = expiry.split('/');
    if (parts.length !== 2) return { valid: false, month: 0, year: 0, error: 'Formato inválido. Use MM/AA' };
    const month = parseInt(parts[0], 10);
    let year = parseInt(parts[1], 10);
    if (isNaN(month) || month < 1 || month > 12) return { valid: false, month: 0, year: 0, error: 'Mês inválido' };
    if (parts[1].length === 2) year = 2000 + year;
    const now = new Date(); const cy = now.getFullYear(); const cm = now.getMonth() + 1;
    if (year < cy || (year === cy && month < cm)) return { valid: false, month: 0, year: 0, error: 'Cartão expirado' };
    return { valid: true, month, year };
  };

  const handleBack = () => storeId ? navigate(`/loja/${storeId}`) : navigate(-1);

  // ── PIX / Cartão submit ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!customerName || !customerEmail || !customerCpf) { toast.error('Preencha todos os campos obrigatórios'); return; }
    const cpfClean = customerCpf.replace(/\D/g,'');
    if (cpfClean.length !== 11) { toast.error('CPF inválido'); return; }
    if (!product) { toast.error('Produto não encontrado'); return; }

    setStep('processing'); setProcessingPayment(true);
    const customer = { name: customerName, email: customerEmail, document: cpfClean, phone: customerPhone.replace(/\D/g,'') };
    const items = [{ amount: Math.round(product.price*100), description: product.description, quantity: 1, code: product.id }];

    try {
      if (paymentMethod === 'pix') {
        const r = await fetch('/api/public/checkout/pix', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ customer, items, storeId, productId, quantity: 1 }) });
        const result = await r.json();
        if (result.success) {
          setPixData({ qrCode: result.pix.qrCode, qrCodeUrl: result.pix.qrCodeUrl, expiresAt: result.pix.expiresAt, orderId: result.orderId });
          setOrderId(result.orderId); setStep('pix-waiting');
        } else { setStep('error'); toast.error(result.error || 'Erro ao gerar PIX'); }
      } else {
        if (!cardNumber||!cardName||!cardExpiry||!cardCvv) { toast.error('Preencha todos os dados do cartão'); setStep('form'); setProcessingPayment(false); return; }
        const cardNum = cardNumber.replace(/\s/g,'');
        if (cardNum.length<13||cardNum.length>19) { toast.error('Número inválido'); setStep('form'); setProcessingPayment(false); return; }
        const expVal = validateExpiry(cardExpiry);
        if (!expVal.valid) { toast.error(expVal.error||'Validade inválida'); setStep('form'); setProcessingPayment(false); return; }
        const cvv = cardCvv.replace(/\D/g,'');
        if (cvv.length<3||cvv.length>4) { toast.error('CVV inválido'); setStep('form'); setProcessingPayment(false); return; }
        const tokR = await fetch('/api/public/checkout/tokenize', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ card:{ number:cardNum, holder_name:cardName, holder_document:cpfClean, exp_month:expVal.month, exp_year:expVal.year, cvv } }) });
        const tokRes = await tokR.json();
        if (!tokRes.success) { setStep('error'); toast.error(tokRes.error||'Erro ao processar cartão'); setProcessingPayment(false); return; }
        const ordR = await fetch('/api/public/checkout/card', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ customer, items, cardToken:tokRes.tokenId, installments, statementDescriptor:(store?.store_name||'NEXUS').slice(0,13), storeId, productId, quantity:1 }) });
        const ordRes = await ordR.json();
        if (ordRes.success) {
          const cs = (ordRes.chargeStatus || ordRes.status || '').toUpperCase();
          const failedStatuses = ['FAILED','DECLINED','CANCELED','VOIDED','ERROR','REFUSED','OVERDUE'];
          if (failedStatuses.includes(cs) || ordRes.paymentSuccess===false) { setStep('error'); toast.error('Pagamento recusado.'); }
          else { setOrderId(ordRes.orderId); setStep('success'); }
        } else { setStep('error'); toast.error(ordRes.error||'Erro ao processar cartão'); }
      }
    } catch (err: any) { setStep('error'); toast.error(err.message||'Erro ao processar pagamento'); }
    finally { setProcessingPayment(false); }
  };

  // ── Dinheiro ─────────────────────────────────────────────────────────────────
  const handleCashDetected = (p: CashProduct) => {
    setCashProduct(p);
    setScannerOpen(false);
    setCashStep('confirm');
  };

  const handleCashConfirm = async () => {
    if (!cashProduct || !storeId) return;
    setProcessingCash(true);
    try {
      const r = await fetch(`/api/public/store/${storeId}/cash-sale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: cashProduct.id,
          customerName: cashName || undefined,
          customerPhone: cashPhone || undefined,
          quantity: 1,
        }),
      });
      const data = await r.json();
      if (data.success) {
        setCashStep('success');
        toast.success('Venda registrada com sucesso!');
      } else {
        toast.error(data.error || 'Erro ao registrar venda');
      }
    } catch (err: any) {
      toast.error('Erro ao registrar venda');
    } finally {
      setProcessingCash(false);
    }
  };

  const copyPixCode = () => { if (pixData?.qrCode) { navigator.clipboard.writeText(pixData.qrCode); toast.success('Código PIX copiado!'); } };

  // ─── loading / erro inicial ──────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4"><Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" /><p className="text-muted-foreground">Carregando...</p></div>
    </div>
  );
  if (error || !product) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center"><div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center"><AlertCircle className="h-8 w-8 text-destructive" /></div><CardTitle>Produto não encontrado</CardTitle></CardHeader>
        <CardContent className="space-y-4"><p className="text-muted-foreground text-center">{error}</p><Button onClick={handleBack} className="w-full"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button></CardContent>
      </Card>
    </div>
  );

  // ─── success (PIX / cartão) ──────────────────────────────────────────────────
  if (step === 'success') return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center"><div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center"><CheckCircle className="h-8 w-8 text-green-600" /></div><CardTitle className="text-green-600">Pagamento Confirmado!</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-lg font-semibold">{product.description}</p>
          <p className="text-2xl font-bold text-green-600">{fmt.currency(product.price)}</p>
          <Button onClick={handleBack} className="w-full mt-4"><ArrowLeft className="h-4 w-4 mr-2" />Voltar para Loja</Button>
        </CardContent>
      </Card>
    </div>
  );

  if (step === 'error') return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center"><div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center"><AlertCircle className="h-8 w-8 text-destructive" /></div><CardTitle className="text-destructive">Erro no Pagamento</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-muted-foreground">Ocorreu um erro. Por favor, tente novamente.</p>
          <Button onClick={() => setStep('form')} className="w-full">Tentar Novamente</Button>
          <Button onClick={handleBack} variant="outline" className="w-full"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
        </CardContent>
      </Card>
    </div>
  );

  if (step === 'pix-waiting' && pixData) return (
    <div className="min-h-screen bg-background p-4">
      <div className="container max-w-md mx-auto">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" />Pagamento PIX</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center">
              {pixData.qrCodeUrl ? (
                <img
                  src={pixData.qrCodeUrl.startsWith('data:') ? pixData.qrCodeUrl : `data:image/png;base64,${pixData.qrCodeUrl}`}
                  alt="QR Code PIX"
                  className="w-48 h-48 border rounded-lg"
                />
              ) : (
                <div className="w-48 h-48 border rounded-lg flex items-center justify-center bg-muted"><QrCode className="w-24 h-24 text-muted-foreground" /></div>
              )}
              <p className="mt-4 text-center text-sm text-muted-foreground">Escaneie o QR Code ou copie o código abaixo</p>
            </div>
            <div className="flex gap-2">
              <Input value={pixData.qrCode||''} readOnly className="text-xs" />
              <Button variant="outline" onClick={copyPixCode}><Copy className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span>Aguardando confirmação...</span></div>
            <div className="bg-muted p-3 rounded-lg"><p className="font-medium text-sm">{product.description}</p><p className="text-lg font-bold text-primary">{fmt.currency(product.price)}</p></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // ─── formulário principal ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Scanner de dinheiro */}
      {storeId && (
        <CashScanner
          open={scannerOpen}
          storeId={storeId}
          onDetected={handleCashDetected}
          onClose={() => setScannerOpen(false)}
        />
      )}

      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center px-4">
          <Button variant="ghost" size="sm" onClick={handleBack}><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
          <span className="ml-4 font-semibold">Finalizar Compra</span>
        </div>
      </header>

      <div className="container max-w-2xl mx-auto p-4 space-y-6">
        {/* Resumo do produto */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Resumo do Produto</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="w-24 h-24 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                {product.image ? <img src={product.image} alt={product.description} className="h-full w-full object-cover" /> : <Package className="h-8 w-8 text-muted-foreground" />}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{product.description}</h3>
                {product.reference && <p className="text-sm text-muted-foreground">Ref: {product.reference}</p>}
                {product.category && <Badge variant="secondary" className="mt-1">{product.category}</Badge>}
                <p className="text-xl font-bold text-primary mt-2">{fmt.currency(product.price)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {step === 'processing' ? (
          <Card><CardContent className="py-12 text-center"><Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" /><p className="text-lg font-medium">Processando pagamento...</p></CardContent></Card>
        ) : (
          <>
            {/* Dados do cliente — apenas para PIX e cartão */}
            {paymentMethod !== 'cash' && (
              <Card>
                <CardHeader><CardTitle>Dados do Cliente</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2"><Label>Nome Completo *</Label><Input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="João da Silva" /></div>
                    <div className="sm:col-span-2"><Label>Email *</Label><Input type="email" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} placeholder="joao@email.com" /></div>
                    <div><Label>CPF *</Label><Input value={customerCpf} onChange={e=>setCustomerCpf(fmt.cpf(e.target.value))} placeholder="000.000.000-00" /></div>
                    <div><Label>Telefone</Label><Input value={customerPhone} onChange={e=>setCustomerPhone(fmt.phone(e.target.value))} placeholder="(11) 99999-9999" /></div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Forma de pagamento */}
            <Card>
              <CardHeader><CardTitle>Forma de Pagamento</CardTitle></CardHeader>
              <CardContent>
                <Tabs value={paymentMethod} onValueChange={v => { setPaymentMethod(v as any); if(v==='cash'){setCashStep('scan');setCashProduct(null);} }}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="pix"><QrCode className="w-4 h-4 mr-1.5" />PIX</TabsTrigger>
                    <TabsTrigger value="card"><CreditCard className="w-4 h-4 mr-1.5" />Cartão</TabsTrigger>
                    <TabsTrigger value="cash"><Banknote className="w-4 h-4 mr-1.5" />Dinheiro</TabsTrigger>
                  </TabsList>

                  {/* ── PIX ── */}
                  <TabsContent value="pix" className="mt-4">
                    <div className="bg-muted/50 p-4 rounded-lg text-center">
                      <QrCode className="h-12 w-12 text-primary mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Pagamento instantâneo via PIX. O QR Code será gerado após confirmar.</p>
                    </div>
                  </TabsContent>

                  {/* ── Cartão ── */}
                  <TabsContent value="card" className="mt-4 space-y-4">
                    <div><Label>Número do Cartão *</Label><Input value={cardNumber} onChange={e=>setCardNumber(fmt.card(e.target.value))} placeholder="0000 0000 0000 0000" /></div>
                    <div><Label>Nome no Cartão *</Label><Input value={cardName} onChange={e=>setCardName(e.target.value.toUpperCase())} placeholder="JOAO DA SILVA" /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label>Validade *</Label><Input value={cardExpiry} onChange={e=>setCardExpiry(fmt.expiry(e.target.value))} placeholder="MM/AA" /></div>
                      <div><Label>CVV *</Label><Input value={cardCvv} onChange={e=>setCardCvv(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="123" type="password" /></div>
                    </div>
                    <div><Label>Parcelas</Label>
                      <select value={installments} onChange={e=>setInstallments(Number(e.target.value))} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(n=><option key={n} value={n}>{n}x de {fmt.currency(product.price/n)}</option>)}
                      </select>
                    </div>
                  </TabsContent>

                  {/* ── Dinheiro ── */}
                  <TabsContent value="cash" className="mt-4 space-y-4">
                    {cashStep === 'scan' && (
                      <div className="space-y-4">
                        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 rounded-lg text-center space-y-3">
                          <Banknote className="h-12 w-12 text-green-600 mx-auto" />
                          <p className="text-sm font-medium text-green-800 dark:text-green-200">Venda em Dinheiro</p>
                          <p className="text-xs text-green-600 dark:text-green-400">Escaneie o código de barras da peça para registrar a venda. A câmera será ativada.</p>
                        </div>
                        <Button onClick={() => setScannerOpen(true)} className="w-full bg-green-600 hover:bg-green-700 text-white" size="lg">
                          <Camera className="h-5 w-5 mr-2" />Escanear Código de Barras
                        </Button>
                      </div>
                    )}
                    {cashStep === 'confirm' && cashProduct && (
                      <div className="space-y-4">
                        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 rounded-lg">
                          <div className="flex items-start gap-3">
                            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                            <div className="flex-1">
                              <p className="font-semibold text-sm">{cashProduct.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">SKU: {cashProduct.sku}</p>
                              <p className="text-lg font-bold text-green-600 mt-1">{fmt.currency(cashProduct.price)}</p>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">Dados do cliente (opcional):</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label className="text-xs">Nome</Label><Input value={cashName} onChange={e=>setCashName(e.target.value)} placeholder="Nome do cliente" className="h-9 text-sm" /></div>
                          <div><Label className="text-xs">Telefone</Label><Input value={cashPhone} onChange={e=>setCashPhone(fmt.phone(e.target.value))} placeholder="(11) 99999-9999" className="h-9 text-sm" /></div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => { setCashStep('scan'); setCashProduct(null); }} className="flex-1" size="sm">
                            <Camera className="h-4 w-4 mr-1" />Reescanear
                          </Button>
                          <Button onClick={handleCashConfirm} disabled={processingCash} className="flex-1 bg-green-600 hover:bg-green-700" size="sm">
                            {processingCash ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                            Confirmar Venda
                          </Button>
                        </div>
                      </div>
                    )}
                    {cashStep === 'success' && cashProduct && (
                      <div className="space-y-4 text-center">
                        <div className="mx-auto h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                          <CheckCircle className="h-8 w-8 text-green-600" />
                        </div>
                        <p className="text-lg font-semibold text-green-600">Venda Registrada!</p>
                        <p className="text-sm text-muted-foreground">{cashProduct.name} — {fmt.currency(cashProduct.price)}</p>
                        <Button onClick={handleBack} className="w-full mt-2"><ArrowLeft className="h-4 w-4 mr-2" />Voltar para Loja</Button>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Botão de submit — apenas para PIX e cartão */}
            {paymentMethod !== 'cash' && (
              <Button onClick={handleSubmit} disabled={processingPayment} className="w-full" size="lg">
                {processingPayment ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processando...</> : <><Check className="mr-2 h-4 w-4" />Pagar {fmt.currency(product.price)}</>}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
