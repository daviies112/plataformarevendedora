import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import StorePreview from '@/features/revendedora/components/store/StorePreview';

export default function PublicStore() {
  const params = useParams<{ storeId: string }>();
  const storeId = params.storeId || window.location.pathname.split('/loja/')[1]?.split('/')[0];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeData, setStoreData] = useState<any>(null);

  useEffect(() => {
    if (storeId) loadStore();
  }, [storeId]);

  const loadStore = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/public/store/${encodeURIComponent(storeId!)}/full`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }
      const data = await res.json();
      setStoreData(data);
    } catch (err: any) {
      console.error('[PublicStore] Error:', err);
      setError(err.message || 'Erro ao carregar loja');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#080808' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 style={{ width: 40, height: 40, color: '#C9A84C', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#B8B0A0', fontSize: 14 }}>Carregando loja...</p>
        </div>
      </div>
    );
  }

  if (error || !storeData) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#080808' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ color: '#B8B0A0', fontSize: 18, marginBottom: 8 }}>Loja não encontrada</p>
          <p style={{ color: '#6B6358', fontSize: 14 }}>{error || 'Esta loja não existe ou foi removida'}</p>
        </div>
      </div>
    );
  }

  return (
    <StorePreview
      settings={storeData.settings || {}}
      banners={storeData.banners || []}
      benefits={storeData.benefits || []}
      videos={storeData.videos || []}
      mosaics={storeData.mosaics || []}
      products={storeData.products || []}
      showFullPage={true}
    />
  );
}
