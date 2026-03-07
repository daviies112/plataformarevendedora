import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
    Search,
    Package,
    Phone,
    Instagram,
    Loader2,
    Store as StoreIcon,
    Share2,
    MessageCircle,
    CreditCard
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export interface Product {
    id: string;
    description: string | null;
    price: number | null;
    image: string | null;
    category: string | null;
    reference: string | null;
    stock: number | null;
}

export interface StoreData {
    id?: string;
    reseller_id?: string;
    store_name: string;
    store_slug: string | null;
    is_published: boolean;
}

export interface ResellerProfile {
    profile_photo_url: string | null;
    phone: string | null;
    instagram_handle: string | null;
    bio: string | null;
    show_career_level?: boolean;
}

interface StoreFrontProps {
    store: StoreData;
    reseller?: any;
    profile?: ResellerProfile | null;
    products: Product[];
    loading?: boolean;
    previewMode?: boolean;
}

export function StoreFront({
    store,
    reseller,
    profile,
    products,
    loading = false,
    previewMode = false
}: StoreFrontProps) {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

    const filteredProducts = useMemo(() => {
        if (!searchTerm) return products;

        return products.filter(product =>
            product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            product.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            product.category?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [products, searchTerm]);

    const filteredByCategory = useMemo(() => {
        const result: { [key: string]: Product[] } = {};
        filteredProducts.forEach(product => {
            const category = product.category || 'Outros';
            if (!result[category]) {
                result[category] = [];
            }
            result[category].push(product);
        });
        return result;
    }, [filteredProducts]);

    const formatCurrency = (value: number | null) => {
        if (value === null) return 'Consulte';
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    };

    const handleWhatsApp = (product?: Product) => {
        if (previewMode) {
            toast.info('Modo de visualização: Redirecionamento para WhatsApp simulado.');
            return;
        }

        const phone = profile?.phone || reseller?.phone;
        if (!phone) {
            toast.error('Telefone não disponível');
            return;
        }

        const cleanPhone = phone.replace(/\D/g, '');
        const phoneWithCountry = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

        let message = `Olá! Vim da sua loja online "${store?.store_name}"`;
        if (product) {
            message += ` e gostaria de saber mais sobre o produto: ${product.description}`;
            if (product.reference) {
                message += ` (Ref: ${product.reference})`;
            }
        } else {
            message += ` e gostaria de saber mais sobre seus produtos.`;
        }

        window.open(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`, '_blank');
    };

    const handleBuyProduct = (product: Product) => {
        if (previewMode) {
            toast.info('Modo de visualização: Compra simulada.');
            return;
        }

        if (!product.price) {
            handleWhatsApp(product);
            return;
        }

        setSelectedProduct(null);

        // Check if we have storeId from store object or need to fallback
        const checkoutStoreId = store?.store_slug || store?.id;
        if (checkoutStoreId) {
            navigate(`/checkout/${product.id}?storeId=${checkoutStoreId}`);
        } else {
            toast.error('Erro ao identificar a loja para checkout');
        }
    };

    const handleShare = () => {
        if (previewMode) {
            toast.info('Link da loja copiado (simulação)');
            return;
        }

        const url = window.location.href;
        const text = `Confira a loja ${store?.store_name}!`;

        if (navigator.share) {
            navigator.share({ title: store?.store_name, text, url });
        } else {
            navigator.clipboard.writeText(url);
            toast.success('Link copiado!');
        }
    };

    if (loading) {
        return (
            <div className="min-h-[400px] flex items-center justify-center bg-background">
                <div className="text-center space-y-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
                    <p className="text-muted-foreground">Carregando loja...</p>
                </div>
            </div>
        );
    }

    // Se não tem produtos e não está carregando
    if (!loading && products.length === 0) {
        // Optional: Render empty state or just standard layout with empty lists
    }

    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border">
                            <AvatarImage src={profile?.profile_photo_url || undefined} alt={store.store_name} />
                            <AvatarFallback className="bg-primary/10 text-primary">
                                {store.store_name?.charAt(0) || 'L'}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <h1 className="font-semibold text-lg">{store.store_name}</h1>
                            {products.length > 0 && (
                                <p className="text-xs text-muted-foreground">{products.length} produtos</p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="icon" variant="ghost" onClick={handleShare} data-testid="button-share">
                            <Share2 className="h-5 w-5" />
                        </Button>
                        {(profile?.phone || reseller?.phone) && (
                            <Button size="icon" variant="default" onClick={() => handleWhatsApp()} data-testid="button-whatsapp">
                                <MessageCircle className="h-5 w-5" />
                            </Button>
                        )}
                    </div>
                </div>
            </header>

            <div className="container px-4 py-6 space-y-6">
                {profile?.bio && (
                    <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="py-4">
                            <p className="text-sm text-center">{profile.bio}</p>
                        </CardContent>
                    </Card>
                )}

                <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar produtos..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9"
                            data-testid="input-search"
                        />
                    </div>
                </div>

                {filteredProducts.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">
                                {searchTerm ? 'Nenhum produto encontrado para sua busca' : 'Nenhum produto disponível'}
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-8">
                        {Object.entries(filteredByCategory).map(([category, categoryProducts]) => (
                            <div key={category} className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-xl font-semibold">{category}</h2>
                                    <Badge variant="secondary">{categoryProducts.length}</Badge>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                    {categoryProducts.map((product) => (
                                        <Card
                                            key={product.id}
                                            className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                                            onClick={() => setSelectedProduct(product)}
                                            data-testid={`card-product-${product.id}`}
                                        >
                                            <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                                                {product.image ? (
                                                    <img
                                                        src={product.image}
                                                        alt={product.description || 'Produto'}
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <Package className="h-12 w-12 text-muted-foreground" />
                                                )}
                                            </div>
                                            <CardContent className="p-3 space-y-1">
                                                <h3 className="font-medium text-sm line-clamp-2">
                                                    {product.description || 'Sem descrição'}
                                                </h3>
                                                {product.reference && (
                                                    <p className="text-xs text-muted-foreground">Ref: {product.reference}</p>
                                                )}
                                                <p className="text-primary font-bold">
                                                    {formatCurrency(product.price)}
                                                </p>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <footer className="border-t mt-12 py-6">
                <div className="container px-4 text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                        © {new Date().getFullYear()} {store.store_name}
                    </p>
                    <div className="flex items-center justify-center gap-3">
                        {profile?.instagram_handle && (
                            <Button variant="ghost" size="sm" asChild>
                                <a
                                    href={`https://instagram.com/${profile.instagram_handle.replace('@', '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <Instagram className="h-4 w-4 mr-1" />
                                    {profile.instagram_handle}
                                </a>
                            </Button>
                        )}
                        {(profile?.phone || reseller?.phone) && (
                            <Button variant="ghost" size="sm" onClick={() => handleWhatsApp()}>
                                <Phone className="h-4 w-4 mr-1" />
                                {profile?.phone || reseller?.phone}
                            </Button>
                        )}
                    </div>
                </div>
            </footer>

            <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{selectedProduct?.description || 'Produto'}</DialogTitle>
                        {selectedProduct?.reference && (
                            <DialogDescription>Referência: {selectedProduct.reference}</DialogDescription>
                        )}
                    </DialogHeader>

                    {selectedProduct && (
                        <div className="space-y-4">
                            <div className="aspect-square bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                                {selectedProduct.image ? (
                                    <img
                                        src={selectedProduct.image}
                                        alt={selectedProduct.description || 'Produto'}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <Package className="h-20 w-20 text-muted-foreground" />
                                )}
                            </div>

                            <div className="space-y-2">
                                {selectedProduct.category && (
                                    <Badge variant="secondary">{selectedProduct.category}</Badge>
                                )}
                                <p className="text-2xl font-bold text-primary">
                                    {formatCurrency(selectedProduct.price)}
                                </p>
                                {selectedProduct.stock !== null && selectedProduct.stock > 0 && (
                                    <p className="text-sm text-muted-foreground">
                                        {selectedProduct.stock} unidades disponíveis
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <DialogFooter className="flex flex-col sm:flex-row gap-2">
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => selectedProduct && handleWhatsApp(selectedProduct)}
                            data-testid="button-product-whatsapp"
                        >
                            <MessageCircle className="h-4 w-4 mr-2" />
                            Perguntar no WhatsApp
                        </Button>
                        {selectedProduct?.price && (
                            <Button
                                className="flex-1"
                                onClick={() => selectedProduct && handleBuyProduct(selectedProduct)}
                                data-testid="button-product-buy"
                            >
                                <CreditCard className="h-4 w-4 mr-2" />
                                Comprar Agora
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
