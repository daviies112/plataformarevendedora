import { useState, useEffect } from 'react';
import { useSupabase } from '@/features/revendedora/contexts/SupabaseContext';
import { useCompany } from '@/features/revendedora/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/features/revendedora/components/ui/card';
import { Input } from '@/features/revendedora/components/ui/input';
import { Search, Package, Sparkles } from 'lucide-react';
import { Badge } from '@/features/revendedora/components/ui/badge';
import { toast } from 'sonner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/features/revendedora/components/ui/table';
import { Button } from '@/features/revendedora/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { FotoIAModal } from '@/features/revendedora/components/inventory/FotoIAModal';

export default function ResellerProducts() {
  const { client: supabase, loading: supabaseLoading, configured } = useSupabase();
  const { loading: companyLoading } = useCompany();
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [fotoIAProduct, setFotoIAProduct] = useState<any | null>(null);
  const [fotoIAOpen, setFotoIAOpen] = useState(false);

  useEffect(() => {
    if (!supabaseLoading) {
      if (configured && supabase) { loadProducts(); }
      else { setLoading(false); }
    }
  }, [configured, supabase, supabaseLoading]);

  const loadProducts = async () => {
    if (!supabase) { toast.error('Cliente Supabase nao configurado'); setLoading(false); return; }
    try {
      const { data, error } = await supabase.from('products').select('*').order('description');
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Erro ao carregar produtos');
    } finally { setLoading(false); }
  };

  const handleFotoIASaved = (novaUrl: string) => {
    setProducts(prev => prev.map(p => p.id === fotoIAProduct?.id ? { ...p, image: novaUrl } : p));
  };

  const filteredProducts = products.filter(product =>
    (product.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.barcode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.reference || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading || companyLoading || supabaseLoading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }
  if (!configured) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Supabase nao esta configurado</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Produtos</h1>
          <p className="text-muted-foreground">Catalogo de produtos disponíveis</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo de Produtos</CardTitle>
          <CardDescription>
            {products.length} produto{products.length !== 1 ? 's' : '' } disponíve{products.length !== 1 ? 'is' : 'l'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar produtos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Imagem</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Código de Barras</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>IA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                      {product.image ? (
                        <img src={product.image} alt={product.description || 'Produto'} className="h-full w-full object-cover" />
                      ) : (
                        <Package className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{product.description || 'Sem descricao'}</div>
                      {product.reference && <div className="text-sm text-muted-foreground">Ref: {product.reference}</div>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{product.barcode || '-'}</TableCell>
                  <TableCell>{product.category && <Badge variant="secondary">{product.category}</Badge>}</TableCell>
                  <TableCell className="font-semibold">
                    {product.price ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price) : '-'}
                  </TableCell>
                  <TableCell>
                    {product.stock !== null && product.stock !== undefined ? (
                      product.stock > 0 ? <Badge variant="default">{product.stock} un.</Badge> : <Badge variant="secondary">Esgotado</Badge>
                    ) : <Badge variant="outline">-</Badge>}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-purple-600 border-purple-300 hover:bg-purple-50"
                      onClick={() => { setFotoIAProduct(product); setFotoIAOpen(true); }}
                    >
                      <Sparkles className="h-3 w-3" />
                      Foto IA
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum produto encontrado</p>
            </div>
          )}
        </CardContent>
      </Card>

      <FotoIAModal
        product={fotoIAProduct}
        open={fotoIAOpen}
        onOpenChange={setFotoIAOpen}
        onSaved={handleFotoIASaved}
      />
    </div>
  );
}
