import { useState, useEffect, useMemo } from 'react';
import { useSupabase } from '@/features/revendedora/contexts/SupabaseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/features/revendedora/components/ui/card';
import { Store as StoreIcon, Package, Plus, X, Save, ArrowRight, Search, ShoppingCart, Boxes, Globe, Link2, Copy, Check, MessageCircle, QrCode, ExternalLink } from 'lucide-react';
import { Button } from '@/features/revendedora/components/ui/button';
import { toast } from 'sonner';
import { Badge } from '@/features/revendedora/components/ui/badge';
import { getResellerId as getStoredResellerId, resellerFetch } from '@/features/revendedora/lib/resellerAuth';
import { useCompany } from '@/features/revendedora/contexts/CompanyContext';
import { Input } from '@/features/revendedora/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/features/revendedora/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/features/revendedora/components/ui/dialog';
import { SellProductModal } from '@/features/revendedora/components/modals/SellProductModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/features/revendedora/components/ui/tabs';
import { ProductRequestModal } from '@/features/revendedora/components/modals/ProductRequestModal';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/features/revendedora/components/ui/accordion';
import { ResellerProfileForm } from '@/features/revendedora/components/reseller/ResellerProfileForm';
import { User } from 'lucide-react';
import { Switch } from '@/features/revendedora/components/ui/switch';
import StorePreview from '@/features/revendedora/components/store/StorePreview';
import { Label } from '@/features/revendedora/components/ui/label';

export default function Store() {
  const { client: supabase, loading: supabaseLoading, configured } = useSupabase();
  const { branding } = useCompany();
  const accent = branding.button_color || '#954728';
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [storeProducts, setStoreProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draggedProduct, setDraggedProduct] = useState<any>(null);
  const [viewingProduct, setViewingProduct] = useState<any>(null);
  const [sellingProduct, setSellingProduct] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [requestingProduct, setRequestingProduct] = useState<any>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [urlCopied, setUrlCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [savedStoreSlug, setSavedStoreSlug] = useState('');
  const [fullStoreData, setFullStoreData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [maletaItems, setMaletaItems] = useState<any[]>([]);
  const [loadingMaleta, setLoadingMaleta] = useState(false);

  const loadMaletaItems = async () => {
    const resellerId = getResellerId();
    if (!resellerId) return;
    try {
      setLoadingMaleta(true);
      const res = await resellerFetch('/api/reseller/maleta-items');
      if (res.ok) {
        const data = await res.json();
        setMaletaItems(data.items || []);
      }
    } catch(e) {
      console.warn('[Store] Erro ao carregar maleta:', e);
    } finally {
      setLoadingMaleta(false);
    }
  };

  const loadFullStoreData = async (slug: string) => {
    if (!slug) return;
    try {
      setLoadingPreview(true);
      const res = await fetch(`/api/public/store/${slug}/full`);
      if (res.ok) {
        const data = await res.json();
        console.log('[Store] fullStoreData:', data);
        setFullStoreData(data);
      }
    } catch(e) {
      console.warn('[Store] Erro ao carregar preview:', e);
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (!supabaseLoading && configured) {
      loadProducts();
      loadStoreConfiguration();
      loadMaletaItems();
    } else if (!supabaseLoading && !configured) {
      setLoading(false);
    }
  }, [supabaseLoading, configured]);

  const loadProducts = async () => {
    if (!supabase) { setLoading(false); return; }
    try {
      const { data, error } = await supabase.from('products').select('*').order('description');
      if (error) throw error;
      setAllProducts(data || []);
    } catch (error) {
      toast.error('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  };

  const getResellerId = (): string | null => getStoredResellerId() || null;

  const loadStoreConfiguration = async () => {
    const resellerId = getResellerId();
    if (!resellerId) return;
    try {
      const response = await resellerFetch('/api/reseller/store-config');
      if (!response.ok) throw new Error('Erro ao carregar configuração');
      const result = await response.json();
      if (result.success && result.data) {
        const data = result.data;
        setIsPublished(data.is_published || false);
        setStoreName(data.store_name || '');
        setStoreSlug(data.store_slug || '');
        if (data.product_ids?.length > 0 && supabase) {
          const { data: products } = await supabase.from('products').select('*').in('id', data.product_ids);
          setStoreProducts(products || []);
        } else {
          setStoreProducts([]);
        }
        localStorage.setItem(`reseller_store_config_${resellerId}`, JSON.stringify({
          product_ids: data.product_ids || [],
          is_published: data.is_published,
          store_name: data.store_name,
          store_slug: data.store_slug,
        }));
        // Carregar preview da vitrine
        loadFullStoreData(data.store_slug || resellerId);
      } else {
        const saved = localStorage.getItem(`reseller_store_config_${resellerId}`);
        if (saved) {
          const config = JSON.parse(saved);
          if (config.product_ids?.length > 0 && supabase) {
            const { data: products } = await supabase.from('products').select('*').in('id', config.product_ids);
            setStoreProducts(products || []);
          }
          setIsPublished(config.is_published || false);
          setStoreName(config.store_name || '');
          setStoreSlug(config.store_slug || '');
        }
      }
    } catch (error: any) {
      const saved = localStorage.getItem(`reseller_store_config_${resellerId}`);
      if (saved) {
        const config = JSON.parse(saved);
        setStoreProducts(config.products || []);
        setIsPublished(config.is_published || false);
        setStoreName(config.store_name || '');
        setStoreSlug(config.store_slug || '');
        loadFullStoreData(config.store_slug || resellerId || '');
      }
    }
  };

  const saveStoreConfiguration = async () => {
    setSaving(true);
    const resellerId = getResellerId();
    try {
      if (!resellerId) { toast.error('Faça login novamente'); setSaving(false); return; }
      const productIds = storeProducts.map(p => p.id);
      const response = await resellerFetch('/api/reseller/store-config', {
        method: 'POST',
        body: JSON.stringify({ product_ids: productIds, is_published: isPublished, store_name: storeName, store_slug: storeSlug || null })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao salvar');
      }
      localStorage.setItem(`reseller_store_config_${resellerId}`, JSON.stringify({ product_ids: productIds, products: storeProducts, is_published: isPublished, store_name: storeName, store_slug: storeSlug }));
      const slug = storeSlug || resellerId;
      setSavedStoreSlug(slug);
      setShowShareModal(true);
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const addProductToStore = (product: any) => {
    if (!storeProducts.find(p => p.id === product.id)) {
      setStoreProducts([...storeProducts, product]);
      toast.success(`${product.description} adicionado à loja`);
    } else {
      toast.info('Produto já está na loja');
    }
  };

  const removeProductFromStore = (productId: string) => {
    setStoreProducts(storeProducts.filter(p => p.id !== productId));
  };

  const handleDragStart = (product: any) => setDraggedProduct(product);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedProduct) { addProductToStore(draggedProduct); setDraggedProduct(null); }
  };

  const categories = useMemo(() => {
    const s = new Set(allProducts.map(p => p.category).filter(c => c?.trim()));
    return Array.from(s).sort();
  }, [allProducts]);

  const filteredProducts = useMemo(() => allProducts.filter(p => {
    const ms = !searchTerm || p.description?.toLowerCase().includes(searchTerm.toLowerCase()) || p.reference?.toLowerCase().includes(searchTerm.toLowerCase());
    const mc = selectedCategory === 'all' || p.category === selectedCategory;
    return ms && mc;
  }), [allProducts, searchTerm, selectedCategory]);

  const storeProductsByCategory = useMemo(() => {
    const g: { [k: string]: any[] } = {};
    storeProducts.forEach(p => { const c = p.category || 'Sem Categoria'; if (!g[c]) g[c] = []; g[c].push(p); });
    return g;
  }, [storeProducts]);

  const allProductsByCategory = useMemo(() => {
    const g: { [k: string]: any[] } = {};
    allProducts.forEach(p => { const c = p.category || 'Sem Categoria'; if (!g[c]) g[c] = []; g[c].push(p); });
    return g;
  }, [allProducts]);

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const getPublicUrl = () => {
    const base = window.location.origin;
    const id = storeSlug || getResellerId();
    return `${base}/loja/${id}`;
  };

  const copyPublicUrl = () => {
    navigator.clipboard.writeText(getPublicUrl());
    setUrlCopied(true);
    toast.success('Link copiado!');
    setTimeout(() => setUrlCopied(false), 2000);
  };

  const shareOnWhatsApp = () => {
    const msg = encodeURIComponent(`Confira minha loja: ${storeName || 'Minha Loja'}\n${getPublicUrl()}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  const generateSlug = (name: string) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();

  if (supabaseLoading) return <div className="flex items-center justify-center h-64">Carregando...</div>;
  if (!configured) return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Supabase não configurado</p></div>;
  if (loading) return <div className="flex items-center justify-center h-64">Carregando produtos...</div>;


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Minha Loja</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)' }}>Configure e publique sua loja</p>
        </div>
        <Button onClick={saveStoreConfiguration} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      <Tabs defaultValue="preview-loja" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6" style={{ backgroundColor: 'var(--brand-card, #4e3b3b)' }}>
          <TabsTrigger value="minha-loja" className="flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.85)' }}>
            <Package className="h-4 w-4" />Minha Maleta
          </TabsTrigger>

          <TabsTrigger value="preview-loja" className="flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.85)' }}>
            <Globe className="h-4 w-4" />Minha Vitrine
          </TabsTrigger>

          <TabsTrigger value="meu-perfil" className="flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.85)' }}>
            <User className="h-4 w-4" />Meu Perfil
          </TabsTrigger>
          <TabsTrigger value="estoque" className="flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.85)' }}>
            <Boxes className="h-4 w-4" />Estoque
          </TabsTrigger>
        </TabsList>

        {/* ======= ABA MINHA VITRINE (preview da loja publica) ======= */}
        <TabsContent value="preview-loja">
          <div className="w-full">
            {loadingPreview ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mr-3" />
                Carregando vitrine...
              </div>
            ) : fullStoreData?.settings ? (
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--brand-button, #954728)', maxHeight: '80vh', overflowY: 'auto' }}>
                <StorePreview
                  settings={fullStoreData.settings}
                  showFullPage={true}
                  products={fullStoreData.products || []}
                  banners={fullStoreData.banners || []}
                  campaigns={fullStoreData.campaigns || []}
                  benefits={fullStoreData.benefits || []}
                  videos={fullStoreData.videos || []}
                  mosaics={fullStoreData.mosaics || []}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
                <Globe className="h-12 w-12 opacity-30" />
                <div className="text-center">
                  <p className="font-medium">Vitrine ainda não configurada</p>
                  <p className="text-sm">Salve sua loja primeiro para ver o preview</p>
                </div>
                <Button variant="outline" onClick={() => loadFullStoreData(savedStoreSlug || storeSlug)}>
                  Recarregar Preview
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ======= ABA MINHA MALETA - somente visualizacao (admin define na plataforma completa) ======= */}
        <TabsContent value="minha-loja">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />Minha Maleta
              </CardTitle>
              <CardDescription>
                Produtos da sua maleta definidos pela administração. Clique em um produto para registrar uma venda.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMaleta ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mr-3" />
                  Carregando maleta...
                </div>
              ) : maletaItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
                  <Package className="h-12 w-12 opacity-30" />
                  <div className="text-center">
                    <p className="font-medium">Nenhum produto na maleta ainda</p>
                    <p className="text-sm opacity-70">Os produtos serão definidos quando sua maleta for preparada pela administração.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {maletaItems.map(item => {
                    const product = item.produto || {};
                    const img = product.image || product.image_url || null;
                    return (
                      <div
                        key={item.id || item.produto_id}
                        onClick={() => product.id && setSellingProduct(product)}
                        className="flex flex-col border rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-shadow bg-card"
                        style={{ borderColor: `${accent}30` }}
                      >
                        <div className="h-40 bg-muted flex items-center justify-center overflow-hidden relative">
                          {img ? (
                            <img src={img} alt={item.produto_nome} className="h-full w-full object-cover" />
                          ) : (
                            <Package className="h-10 w-10 text-muted-foreground" />
                          )}
                          {item.quantidade > 1 && (
                            <Badge className="absolute top-2 right-2" style={{ backgroundColor: accent }}>
                              x{item.quantidade}
                            </Badge>
                          )}
                        </div>
                        <div className="p-3 flex-1 flex flex-col gap-1">
                          <h4 className="font-medium text-sm">{item.produto_nome || product.description || 'Sem descrição'}</h4>
                          {(item.produto_referencia || product.reference) && (
                            <p className="text-xs text-muted-foreground">Ref: {item.produto_referencia || product.reference}</p>
                          )}
                          <p className="text-sm font-semibold mt-auto" style={{ color: accent }}>
                            {(item.preco_unitario || product.price) ? formatCurrency(item.preco_unitario || product.price) : '-'}
                          </p>
                          {product.id && (
                            <Button
                              size="sm"
                              className="w-full mt-2 gap-2"
                              style={{ backgroundColor: accent, borderColor: accent }}
                              onClick={e => { e.stopPropagation(); setSellingProduct(product); }}
                            >
                              <ShoppingCart className="h-3 w-3" /> Registrar Venda
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="meu-perfil">
          <ResellerProfileForm />
        </TabsContent>

        <TabsContent value="estoque">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5" />Estoque da Empresa</CardTitle>
              <CardDescription>Produtos disponíveis no estoque</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(allProductsByCategory).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Package className="h-16 w-16 mb-4" /><p>Nenhum produto no estoque</p>
                </div>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {Object.entries(allProductsByCategory).map(([category, products]) => (
                    <AccordionItem key={category} value={category}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{category}</span>
                          <Badge variant="secondary">{products.length}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid gap-3 pt-2">
                          {products.map(product => (
                            <div key={product.id} onClick={() => setRequestingProduct(product)}
                              className="flex items-center gap-4 p-4 border rounded-lg hover:shadow-md transition-all cursor-pointer bg-card group"
                            >
                              <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 border">
                                {(product.image || product.image_url) ? <img src={product.image || product.image_url} alt={product.description} className="h-full w-full object-cover" /> : <Package className="h-8 w-8 text-muted-foreground" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold truncate transition-colors">{product.description || 'Sem descrição'}</h4>
                                {product.reference && <p className="text-sm text-muted-foreground">REF: {product.reference}</p>}
                                <div className="flex items-center gap-3 mt-1">
                                  <p className="font-bold" style={{ color: accent }}>{formatCurrency(product.price || 0)}</p>
                                  <Badge variant={product.stock > 0 ? 'secondary' : 'destructive'} className="text-xs">
                                    {product.stock !== undefined ? (product.stock > 0 ? `${product.stock} em estoque` : 'Sem estoque') : 'Não informado'}
                                  </Badge>
                                </div>
                              </div>
                              <Button variant="outline" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => { e.stopPropagation(); setRequestingProduct(product); }}>
                                <ShoppingCart className="h-4 w-4 mr-1" />Solicitar
                              </Button>
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
        </TabsContent>
      </Tabs>

      {/* Modal visualizar produto */}
      <Dialog open={!!viewingProduct} onOpenChange={open => !open && setViewingProduct(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewingProduct?.description || 'Produto'}</DialogTitle>
            <DialogDescription>Detalhes do produto</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative w-full h-64 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              {viewingProduct?.image ? <img src={viewingProduct.image} alt={viewingProduct.description} className="w-full h-full object-contain" /> : <Package className="h-20 w-20 text-muted-foreground" />}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {viewingProduct?.reference && <div><p className="text-sm text-muted-foreground">Referência</p><p className="font-medium">{viewingProduct.reference}</p></div>}
              <div><p className="text-sm text-muted-foreground">Preço</p><p className="text-xl font-bold" style={{ color: accent }}>{viewingProduct?.price ? formatCurrency(viewingProduct.price) : '-'}</p></div>
              {viewingProduct?.stock !== undefined && <div><p className="text-sm text-muted-foreground">Estoque</p><p className="font-bold">{viewingProduct.stock} un.</p></div>}
            </div>
            <div className="flex gap-3">
              <DialogClose asChild><Button variant="outline" className="flex-1"><X className="mr-2 h-4 w-4" />Fechar</Button></DialogClose>
              <Button className="flex-1" onClick={() => { if (viewingProduct) { addProductToStore(viewingProduct); setViewingProduct(null); } }}>
                <Plus className="mr-2 h-4 w-4" />Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SellProductModal product={sellingProduct} isOpen={!!sellingProduct} onClose={() => setSellingProduct(null)} resellerId="00000000-0000-0000-0000-000000000000" companyId={sellingProduct?.company_id || '00000000-0000-0000-0000-000000000000'} />
      <ProductRequestModal product={requestingProduct} isOpen={!!requestingProduct} onClose={() => setRequestingProduct(null)} resellerId={getResellerId()} />
      {/* Modal de compartilhamento apos salvar */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Loja Salva com Sucesso!
            </DialogTitle>
            <DialogDescription>
              Sua loja esta disponivel no link abaixo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* URL publica */}
            <div className="p-3 border rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Link da sua loja</p>
              <p className="text-sm font-mono break-all">{getPublicUrl()}</p>
            </div>
            {/* Botoes de acao */}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={copyPublicUrl} className="flex items-center gap-2">
                {urlCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                {urlCopied ? 'Copiado!' : 'Copiar Link'}
              </Button>
              <Button variant="outline" onClick={shareOnWhatsApp} className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
            </div>
            <Button className="w-full" onClick={() => window.open(getPublicUrl(), '_blank')}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir Minha Loja
            </Button>
            {/* QR Code */}
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
                <QrCode className="h-3 w-3" /> QR Code para compartilhar
              </p>
              <div className="flex justify-center p-3 border rounded-lg bg-white">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(getPublicUrl())}`}
                  alt="QR Code"
                  className="w-40 h-40"
                />
              </div>
            </div>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" className="w-full mt-2">Fechar</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  );
}
