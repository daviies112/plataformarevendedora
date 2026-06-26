import { useState, useEffect, useMemo, useRef } from 'react';
import { useSupabase } from '@/features/revendedora/contexts/SupabaseContext';
import { useCompany } from '@/features/revendedora/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/features/revendedora/components/ui/card';
import { Badge } from '@/features/revendedora/components/ui/badge';
import { Button } from '@/features/revendedora/components/ui/button';
import { Input } from '@/features/revendedora/components/ui/input';
import { toast } from 'sonner';
import {
  Package, Boxes, ShoppingCart, ScanLine,
  Search, ChevronDown, ChevronUp, Loader2, Sparkles
} from 'lucide-react';
import { getResellerId as getStoredResellerId, resellerFetch } from '@/features/revendedora/lib/resellerAuth';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/features/revendedora/components/ui/accordion';
import { SellProductModal } from '@/features/revendedora/components/modals/SellProductModal';
import { CashSaleScanner } from '@/features/revendedora/components/modals/CashSaleScanner';
import { ProductRequestModal } from '@/features/revendedora/components/modals/ProductRequestModal';
import { FotoIAModal } from '@/features/revendedora/components/inventory/FotoIAModal';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/features/revendedora/components/ui/dialog';
import { Label } from '@/features/revendedora/components/ui/label';

export default function ResellerProducts() {
  const { client: supabase, loading: supabaseLoading, configured } = useSupabase();
  const { branding } = useCompany();
  const accent = branding.button_color || '#954728';

  // ─── Catálogo ───────────────────────────────────────────────
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [requestingProduct, setRequestingProduct] = useState<any>(null);
  const [fotoIAProduct, setFotoIAProduct] = useState<any | null>(null);
  const [fotoIAOpen, setFotoIAOpen] = useState(false);

  // ─── Maleta ──────────────────────────────────────────────────
  const [maletaItems, setMaletaItems] = useState<any[]>([]);
  const [loadingMaleta, setLoadingMaleta] = useState(false);
  const [maletaSessao, setMaletaSessao] = useState<any>(null);
  const [cashScannerOpen, setCashScannerOpen] = useState(false);
  const [sellingProduct, setSellingProduct] = useState<any>(null);
  const [maletaExpanded, setMaletaExpanded] = useState(false);
  const [valorParcial, setValorParcial] = useState('');
  const [showAcertoParcial, setShowAcertoParcial] = useState(false);

  const getResellerId = (): string | null => getStoredResellerId() || null;

  // ─── Load ────────────────────────────────────────────────────
  const loadProducts = async () => {
    if (!supabase) { setLoadingProducts(false); return; }
    try {
      const { data } = await supabase.from('products').select('*').order('description').limit(200);
      setAllProducts(data || []);
    } catch { toast.error('Erro ao carregar produtos'); } finally { setLoadingProducts(false); }
  };

  const loadMaletaItems = async () => {
    if (!getResellerId()) return;
    try {
      setLoadingMaleta(true);
      const res = await resellerFetch('/api/reseller/maleta-items');
      if (res.ok) { const data = await res.json(); setMaletaItems(data.items || []); setMaletaSessao(data.sessao || null); }
    } catch {} finally { setLoadingMaleta(false); }
  };

  useEffect(() => {
    if (!supabaseLoading && configured) { loadProducts(); loadMaletaItems(); }
    else if (!supabaseLoading && !configured) { setLoadingProducts(false); }
  }, [supabaseLoading, configured]);

  // ─── Maleta helpers ──────────────────────────────────────────
  const totalVendido = useMemo(() => maletaItems.filter(i => i.status === 'vendido').reduce((s, i) => s + Number(i.preco_snapshot || 0), 0), [maletaItems]);
  const maletaPendentes = useMemo(() => maletaItems.filter(i => i.status === 'pendente').length, [maletaItems]);

  const handleAcertoParcial = async () => {
    if (!maletaSessao?.id || !valorParcial) return;
    const res = await resellerFetch('/api/gaps/maleta/acerto-parcial', {
      method: 'POST',
      body: JSON.stringify({ maleta_id: maletaSessao.id, valor_parcial: Number(valorParcial) })
    });
    if (res.ok) { toast.success('Acerto registrado!'); setShowAcertoParcial(false); setValorParcial(''); loadMaletaItems(); }
  };

  const handleRolarPecas = async () => {
    if (!maletaSessao?.id) return;
    const ids = maletaItems.filter(i => i.status === 'pendente').map(i => i.product_id);
    await resellerFetch('/api/gaps/maleta/rolar-pecas', { method: 'POST', body: JSON.stringify({ maleta_id: maletaSessao.id, produto_ids_rolar: ids }) });
    toast.success('Pecas roladas!'); loadMaletaItems();
  };

  // ─── Catálogo helpers ────────────────────────────────────────
  const allProductsByCategory = useMemo(() => {
    const g: { [k: string]: any[] } = {};
    const filtered = searchTerm
      ? allProducts.filter(p =>
          (p.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (p.reference || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (p.barcode || '').toLowerCase().includes(searchTerm.toLowerCase())
        )
      : allProducts;
    filtered.forEach(p => { const c = p.category || 'Sem Categoria'; if (!g[c]) g[c] = []; g[c].push(p); });
    return g;
  }, [allProducts, searchTerm]);

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const handleFotoIASaved = (novaUrl: string) => {
    setAllProducts(prev => prev.map(p => p.id === fotoIAProduct?.id ? { ...p, image: novaUrl } : p));
  };

  if (supabaseLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!configured) return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Supabase nao configurado</p></div>;

  return (
    <div className="space-y-5 pb-10">

      {/* ─── Cabeçalho ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Maleta de amostras e catálogo para solicitar</p>
        </div>
        <Button variant="outline" onClick={() => setCashScannerOpen(true)} className="gap-2">
          <ScanLine className="h-4 w-4" />Venda por Scanner
        </Button>
      </div>

      {/* ─── 1. PEÇAS NA MALETA ─── */}
      <Card style={{ borderColor: `${accent}30` }}>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setMaletaExpanded(v => !v)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" style={{ color: accent }} />
                Peças na Maleta
              </CardTitle>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-xs">{maletaItems.length} peças</Badge>
                {totalVendido > 0 && (
                  <Badge className="text-xs" style={{ backgroundColor: `${accent}30`, color: accent }}>
                    Vendido: {formatCurrency(totalVendido)}
                  </Badge>
                )}
                {maletaPendentes > 0 && (
                  <Badge variant="secondary" className="text-xs">{maletaPendentes} pendentes</Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline"
                onClick={e => { e.stopPropagation(); setCashScannerOpen(true); }}
                className="gap-1.5 text-xs h-7">
                <ScanLine className="h-3 w-3" />Scanner
              </Button>
              {maletaExpanded
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </CardHeader>

        {maletaExpanded && (
          <CardContent className="space-y-4">
            {/* Resumo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border" style={{ borderColor: `${accent}20` }}>
                <p className="text-xs text-muted-foreground">Total Vendido</p>
                <p className="text-xl font-bold" style={{ color: accent }}>{formatCurrency(totalVendido)}</p>
              </div>
              <div className="p-3 rounded-lg border" style={{ borderColor: `${accent}20` }}>
                <p className="text-xs text-muted-foreground">Peças Pendentes</p>
                <p className="text-xl font-bold">{maletaPendentes}</p>
              </div>
            </div>
            {/* Ações */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowAcertoParcial(true)}>Acerto Parcial</Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={handleRolarPecas}>Rolagem de Peças</Button>
            </div>
            {/* Grid de itens */}
            {loadingMaleta ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : maletaItems.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
                <Package className="h-10 w-10 opacity-30" />
                <p className="text-sm">Nenhuma peça na maleta</p>
              </div>
            ) : (
              <>
              {/* Agrupar itens da maleta por categoria — mesmo padrao do catalogo */}
              {(() => {
                const porCat: Record<string, any[]> = {};
                maletaItems.forEach(item => {
                  const cat = (item.categoria || item.produto?.category || 'Sem Categoria').trim() || 'Sem Categoria';
                  if (!porCat[cat]) porCat[cat] = [];
                  porCat[cat].push(item);
                });
                const cats = Object.keys(porCat).sort((a, b) => {
                  if (a === 'Sem Categoria') return 1;
                  if (b === 'Sem Categoria') return -1;
                  return a.localeCompare(b, 'pt-BR');
                });
                return cats.map(cat => (
                  <div key={cat} className="space-y-2">
                    {/* Cabecalho da categoria */}
                    <div className="flex items-center gap-2 py-1">
                      <span
                        className="text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border"
                        style={{ color: accent, borderColor: `${accent}40`, background: `${accent}12` }}
                      >
                        {cat}
                      </span>
                      <span className="text-xs text-muted-foreground">({porCat[cat].length} {porCat[cat].length === 1 ? 'peça' : 'peças'})</span>
                      <div className="flex-1 h-px" style={{ background: `${accent}20` }} />
                    </div>
                    {/* Grid de cards da categoria */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {porCat[cat].map(item => {
                        const product = item.produto || {};
                        const img = product.image || product.image_url || null;
                        return (
                          <div
                            key={item.id || item.produto_id}
                            onClick={() => product.id && setSellingProduct({ product, maletaItemId: item.id })}
                            className="flex flex-col border rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-shadow bg-card"
                            style={{ borderColor: `${accent}25` }}
                          >
                            <div className="h-28 bg-muted flex items-center justify-center overflow-hidden relative">
                              {img
                                ? <img src={img} alt={item.produto_nome} className="h-full w-full object-cover" />
                                : <Package className="h-8 w-8 text-muted-foreground" />}
                              {item.quantidade > 1 && (
                                <Badge className="absolute top-1 right-1 text-xs" style={{ backgroundColor: accent }}>x{item.quantidade}</Badge>
                              )}
                              <Badge
                                className="absolute bottom-1 left-1 text-xs"
                                style={{
                                  backgroundColor: item.status === 'vendido' ? '#22c55e40' : '#f59e0b40',
                                  color: item.status === 'vendido' ? '#22c55e' : '#f59e0b'
                                }}
                              >
                                {item.status === 'vendido' ? 'Vendido' : 'Pendente'}
                              </Badge>
                            </div>
                            <div className="p-2">
                              <p className="text-xs font-medium line-clamp-2">{item.produto_nome || product.description}</p>
                              <p className="text-xs font-bold mt-1" style={{ color: accent }}>{formatCurrency(item.preco_unitario || product.price || 0)}</p>
                              {product.id && (
                                <Button
                                  size="sm"
                                  className="w-full mt-1.5 h-7 text-xs gap-1"
                                  style={{ backgroundColor: accent, borderColor: accent }}
                                  onClick={e => { e.stopPropagation(); setSellingProduct({ product, maletaItemId: item.id }); }}
                                >
                                  <ShoppingCart className="h-3 w-3" />Vender
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* ─── 2. CATÁLOGO / SOLICITAR ─── */}
      <Card style={{ borderColor: `${accent}30` }}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="h-4 w-4" style={{ color: accent }} />
                Catálogo da Empresa
              </CardTitle>
              <CardDescription className="mt-1">
                {allProducts.length} produto{allProducts.length !== 1 ? 's' : ''} disponíve{allProducts.length !== 1 ? 'is' : 'l'}
              </CardDescription>
            </div>
          </div>
          {/* Busca */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, referência ou código..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loadingProducts ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : Object.keys(allProductsByCategory).length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
              <Boxes className="h-10 w-10 opacity-30" />
              <p className="text-sm">{searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto no catálogo'}</p>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {Object.entries(allProductsByCategory).map(([category, products]) => (
                <AccordionItem key={category} value={category}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-sm">{category}</span>
                      <Badge variant="secondary" className="text-xs">{(products as any[]).length}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-2 pt-1">
                      {(products as any[]).map(product => (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 p-3 border rounded-lg hover:shadow-sm transition-all cursor-pointer bg-card group"
                          style={{ borderColor: `${accent}15` }}
                          onClick={() => setRequestingProduct(product)}
                        >
                          <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                            {(product.image || product.image_url)
                              ? <img src={product.image || product.image_url} alt={product.description} className="h-full w-full object-cover" />
                              : <Package className="h-5 w-5 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{product.description}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-sm font-bold" style={{ color: accent }}>{formatCurrency(product.price || 0)}</span>
                              {product.reference && <span className="text-xs text-muted-foreground">Ref: {product.reference}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost" size="sm" className="h-8 w-8 p-0"
                              title="Foto IA"
                              onClick={e => { e.stopPropagation(); setFotoIAProduct(product); setFotoIAOpen(true); }}
                            >
                              <Sparkles className="h-3.5 w-3.5" style={{ color: accent }} />
                            </Button>
                            <Button
                              variant="outline" size="sm" className="h-8 text-xs gap-1"
                              onClick={e => { e.stopPropagation(); setRequestingProduct(product); }}
                            >
                              <ShoppingCart className="h-3 w-3" />Solicitar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* ─── Modais ─── */}
      <CashSaleScanner open={cashScannerOpen} onClose={() => setCashScannerOpen(false)} />
      <SellProductModal
        product={sellingProduct?.product ?? sellingProduct}
        maletaItemId={sellingProduct?.maletaItemId ?? null}
        isOpen={!!sellingProduct}
        onClose={() => setSellingProduct(null)}
        resellerId={getResellerId() || '00000000-0000-0000-0000-000000000000'}
        companyId={(sellingProduct?.product ?? sellingProduct)?.company_id || '00000000-0000-0000-0000-000000000000'}
      />
      <ProductRequestModal
        product={requestingProduct}
        isOpen={!!requestingProduct}
        onClose={() => setRequestingProduct(null)}
        resellerId={getResellerId()}
      />
      <FotoIAModal
        product={fotoIAProduct}
        isOpen={fotoIAOpen}
        onClose={() => { setFotoIAOpen(false); setFotoIAProduct(null); }}
        onSaved={handleFotoIASaved}
      />

      {/* Modal Acerto Parcial */}
      <Dialog open={showAcertoParcial} onOpenChange={setShowAcertoParcial}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acerto Parcial</DialogTitle>
            <DialogDescription>Informe o valor já acertado com a empresa</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>Valor (R$)</Label>
            <Input
              type="number"
              value={valorParcial}
              onChange={e => setValorParcial(e.target.value)}
              placeholder="0,00"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAcertoParcial(false)}>Cancelar</Button>
            <Button onClick={handleAcertoParcial} style={{ backgroundColor: accent }}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
