import { useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/features/revendedora/components/ui/dialog';
import { Button } from '@/features/revendedora/components/ui/button';
import { Camera, CameraOff, FlipHorizontal, X, Wallet, AlertCircle } from 'lucide-react';
import { useCamera } from '@/hooks/assinatura/useCamera';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser';
import DecodeHintType from '@zxing/library/esm/core/DecodeHintType';

interface CashSaleScannerProps {
  open: boolean;
  onClose: () => void;
  onProductDetected: (barcode: string) => void;
}

const beep = (ok: boolean) => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = ok ? 1200 : 330;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.18);
  } catch (_) {}
};

/** 4 variantes de preprocessamento para etiquetas impressas */
const buildPreprocessedCanvases = (video: HTMLVideoElement): HTMLCanvasElement[] => {
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) return [];
  const w = video.videoWidth;
  const h = video.videoHeight;
  const canvases: HTMLCanvasElement[] = [];

  const c1 = document.createElement('canvas');
  c1.width = w; c1.height = h;
  const ctx1 = c1.getContext('2d', { willReadFrequently: true })!;
  ctx1.filter = 'contrast(200%) brightness(110%) grayscale(100%)';
  ctx1.drawImage(video, 0, 0);
  ctx1.filter = 'none';
  canvases.push(c1);

  const c2 = document.createElement('canvas');
  c2.width = w; c2.height = h;
  const ctx2 = c2.getContext('2d', { willReadFrequently: true })!;
  ctx2.filter = 'contrast(350%) brightness(120%) grayscale(100%) saturate(0%)';
  ctx2.drawImage(video, 0, 0);
  ctx2.filter = 'none';
  canvases.push(c2);

  const c3 = document.createElement('canvas');
  c3.width = w; c3.height = h;
  const ctx3 = c3.getContext('2d', { willReadFrequently: true })!;
  ctx3.filter = 'grayscale(100%)';
  ctx3.drawImage(video, 0, 0);
  ctx3.filter = 'none';
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

  const c4 = document.createElement('canvas');
  c4.width = w; c4.height = h;
  const ctx4 = c4.getContext('2d', { willReadFrequently: true })!;
  ctx4.filter = 'contrast(300%) grayscale(100%) invert(100%)';
  ctx4.drawImage(video, 0, 0);
  ctx4.filter = 'none';
  canvases.push(c4);

  return canvases;
};

export function CashSaleScanner({ open, onClose, onProductDetected }: CashSaleScannerProps) {
  const { videoRef, isReady, isInitializing, error, startCamera, stopCamera, switchCamera } =
    useCamera({ facingMode: 'environment' });

  const [frameStatus, setFrameStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [engineLabel, setEngineLabel] = useState('');
  const nativeDetectorRef = useRef<any>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastCodeRef = useRef<string | null>(null);
  const processingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReadyRef = useRef(false);
  const failFramesRef = useRef(0);
  const hasNativeRef = useRef(false);

  useEffect(() => {
    if ('BarcodeDetector' in window) {
      try {
        nativeDetectorRef.current = new (window as any).BarcodeDetector({
          formats: ['ean_8', 'ean_13', 'code_128', 'upc_a', 'upc_e', 'qr_code', 'code_39', 'itf', 'data_matrix'],
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
      zxingReaderRef.current = new BrowserMultiFormatReader(hints);
    } catch (_) {}
  }, []);

  useEffect(() => { isReadyRef.current = isReady; }, [isReady]);

  useEffect(() => {
    if (open) {
      lastCodeRef.current = null;
      processingRef.current = false;
      failFramesRef.current = 0;
      setFrameStatus('idle');
      setMessage('');
      setEngineLabel('');
      startCamera('environment');
    } else {
      stopCamera();
      cancelAnimationFrame(animFrameRef.current);
    }
  }, [open]);

  const handleDetected = useCallback((code: string, engine: string) => {
    processingRef.current = true;
    beep(true);
    if (navigator.vibrate) navigator.vibrate(60);
    setFrameStatus('success');
    setEngineLabel(engine);
    setMessage('Produto detectado!');
    setTimeout(() => {
      onProductDetected(code);
      onClose();
    }, 600);
  }, [onProductDetected, onClose]);

  const detect = useCallback(async () => {
    if (!videoRef.current || !isReadyRef.current || processingRef.current) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }
    let detectedCode: string | null = null;
    let engineUsed = '';
    try {
      // ENGINE 1: nativo direto
      if (nativeDetectorRef.current) {
        try {
          const barcodes = await nativeDetectorRef.current.detect(video);
          if (barcodes.length > 0) { detectedCode = barcodes[0].rawValue; engineUsed = 'Native'; }
        } catch (_) {}
      }
      // ENGINE 1b: nativo + preprocessamento (a cada 5 frames)
      if (!detectedCode && nativeDetectorRef.current) {
        failFramesRef.current++;
        if (failFramesRef.current % 5 === 0) {
          const canvases = buildPreprocessedCanvases(video);
          for (const canvas of canvases) {
            try {
              const barcodes = await nativeDetectorRef.current.detect(canvas);
              if (barcodes.length > 0) { detectedCode = barcodes[0].rawValue; engineUsed = 'Native+Pre'; break; }
            } catch (_) {}
          }
        }
      } else if (!detectedCode && !nativeDetectorRef.current) {
        failFramesRef.current++;
      }
      // ENGINE 2: ZXing decodeFromCanvas (a cada 3 frames)
      if (!detectedCode && zxingReaderRef.current && failFramesRef.current % 3 === 0) {
        const snapCanvas = document.createElement('canvas');
        snapCanvas.width = video.videoWidth;
        snapCanvas.height = video.videoHeight;
        snapCanvas.getContext('2d', { willReadFrequently: true })!.drawImage(video, 0, 0);
        try {
          const result = zxingReaderRef.current.decodeFromCanvas(snapCanvas);
          if (result) { detectedCode = result.getText(); engineUsed = 'ZXing'; }
        } catch (_) {}
        if (!detectedCode) {
          const canvases = buildPreprocessedCanvases(video);
          for (const canvas of canvases) {
            try {
              const result = zxingReaderRef.current.decodeFromCanvas(canvas);
              if (result) { detectedCode = result.getText(); engineUsed = 'ZXing+Pre'; break; }
            } catch (_) {}
          }
        }
      }
      if (detectedCode) failFramesRef.current = 0;
    } catch (_) {}

    if (detectedCode && detectedCode !== lastCodeRef.current) {
      lastCodeRef.current = detectedCode;
      handleDetected(detectedCode, engineUsed);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        lastCodeRef.current = null;
        processingRef.current = false;
      }, 3000);
    }
    animFrameRef.current = requestAnimationFrame(detect);
  }, [handleDetected, videoRef]);

  useEffect(() => {
    if (open) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = requestAnimationFrame(detect); }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [open, detect]);

  const hasAnyEngine = hasNativeRef.current || !!zxingReaderRef.current;
  const frameColor =
    frameStatus === 'success' ? '#22c55e' :
    frameStatus === 'error' ? '#ef4444' : 'rgba(255,255,255,0.7)';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-5 w-5 text-purple-500" />
            Scanner — Venda em Dinheiro
          </DialogTitle>
        </DialogHeader>
        <div className="relative bg-black" style={{ height: '380px' }}>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg width="200" height="120" viewBox="0 0 200 120">
              <rect x="5" y="5" width="190" height="110" rx="10" ry="10" fill="none"
                stroke={frameColor} strokeWidth="3"
                strokeDasharray={frameStatus !== 'idle' ? '0' : '12 6'} />
            </svg>
          </div>
          {engineLabel && (
            <div className="absolute top-2 left-2 bg-black/60 text-white/60 text-[9px] px-2 py-0.5 rounded-full font-mono">{engineLabel}</div>
          )}
          {message && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center">
              <div className="bg-black/80 text-white text-sm px-4 py-2 rounded-full">{message}</div>
            </div>
          )}
          {!hasAnyEngine && isReady && (
            <div className="absolute top-3 left-3 right-3">
              <div className="bg-yellow-500/90 text-white text-xs px-3 py-2 rounded-lg flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Scanner não suportado. Use Chrome ou Edge.
              </div>
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
            Aponte para o código de barras da peça.<br/>
            A venda em dinheiro será registrada automaticamente.
          </p>
          <Button variant="outline" onClick={onClose} className="w-full" size="sm">
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CashSaleScanner;
