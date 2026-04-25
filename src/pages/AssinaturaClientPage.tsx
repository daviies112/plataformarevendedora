import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ContractProvider, useContract } from '@/contexts/ContractContext';
import { VerificationFlow } from '@/components/assinatura/verification/VerificationFlow';
import { ContractStep } from '@/components/assinatura/steps/ContractStep';
import { ResellerWelcomeStep } from '@/components/assinatura/steps/ResellerWelcomeStep';
import { ResidenceProofStep } from '@/components/assinatura/steps/ResidenceProofStep';
import { AppPromotionStep } from '@/components/assinatura/steps/AppPromotionStep';
import { Loader2 } from 'lucide-react';

interface ContractData {
  id: string;
  access_token: string;
  client_name: string;
  client_cpf: string;
  client_email: string;
  client_phone: string | null;
  contract_html: string;
  protocol_number: string | null;
  status: string;
  logo_url?: string | null;
  logo_size?: string;
  logo_position?: string;
  primary_color?: string | null;
  text_color?: string | null;
  font_family?: string | null;
  font_size?: string | null;
  company_name?: string | null;
  footer_text?: string | null;
  button_color?: string | null;
  button_text_color?: string | null;
  icon_color?: string | null;
  title_color?: string | null;
  background_color?: string | null;
  verification_primary_color?: string | null;
  verification_background_color?: string | null;
  verification_text_color?: string | null;
  verification_welcome_text?: string | null;
  verification_instructions?: string | null;
  verification_security_text?: string | null;
  verification_header_background_color?: string | null;
  verification_header_company_name?: string | null;
  verification_footer_text?: string | null;
  progress_card_color?: string | null;
  progress_button_color?: string | null;
  progress_text_color?: string | null;
  progress_title?: string | null;
  progress_subtitle?: string | null;
  progress_step1_title?: string | null;
  progress_step1_description?: string | null;
  progress_step2_title?: string | null;
  progress_step2_description?: string | null;
  progress_step3_title?: string | null;
  progress_step3_description?: string | null;
  progress_button_text?: string | null;
  parabens_title?: string | null;
  parabens_subtitle?: string | null;
  parabens_description?: string | null;
  parabens_card_color?: string | null;
  parabens_background_color?: string | null;
  parabens_button_color?: string | null;
  parabens_text_color?: string | null;
  parabens_form_title?: string | null;
  parabens_button_text?: string | null;
  app_store_url?: string | null;
  google_play_url?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zipcode?: string | null;
  address_complement?: string | null;
}

function AssinaturaFlowInner({ contractData }: { contractData: ContractData }) {
  const { currentStep, setAddressData } = useContract();

  useEffect(() => {
    if (contractData.address_street) {
      setAddressData({
        street: contractData.address_street || '',
        number: contractData.address_number || '',
        city: contractData.address_city || '',
        state: contractData.address_state || '',
        zipcode: contractData.address_zipcode || '',
        complement: contractData.address_complement || undefined,
      });
    }
  }, [contractData, setAddressData]);

  switch (currentStep) {
    case 0:
      return (
        <ResellerWelcomeStep
          client_name={contractData.client_name}
          parabens_title={contractData.progress_title || 'Assinatura Digital'}
          parabens_subtitle={contractData.progress_subtitle || 'Conclua os passos abaixo para finalizar.'}
          parabens_description={'Ola ' + contractData.client_name + ', complete os passos abaixo.'}
          parabens_card_color={contractData.progress_card_color || contractData.parabens_card_color || undefined}
          parabens_background_color={contractData.background_color || undefined}
          parabens_button_color={contractData.button_color || contractData.progress_button_color || undefined}
          parabens_text_color={contractData.progress_text_color || contractData.title_color || undefined}
          parabens_font_family={contractData.font_family || undefined}
          parabens_form_title={contractData.progress_step1_title || '1. Reconhecimento Facial'}
          parabens_button_text={contractData.progress_button_text || 'Iniciar Processo'}
          initialAddress={{
            street: contractData.address_street || '',
            number: contractData.address_number || '',
            city: contractData.address_city || '',
            state: contractData.address_state || '',
            zipcode: contractData.address_zipcode || '',
            complement: contractData.address_complement || '',
          }}
        />
      );
    case 1:
      return (
        <VerificationFlow
          primaryColor={contractData.verification_primary_color || contractData.button_color || '#2c3e50'}
          backgroundColor={contractData.verification_background_color || contractData.background_color || '#ffffff'}
          textColor={contractData.verification_text_color || contractData.text_color || '#333333'}
          welcomeText={contractData.verification_welcome_text || 'Verificacao de Identidade'}
          instructions={contractData.verification_instructions || 'Processo seguro para confirmar sua identidade.'}
          securityText={contractData.verification_security_text || ''}
          headerBackgroundColor={contractData.verification_header_background_color || contractData.verification_primary_color || '#2c3e50'}
          headerCompanyName={contractData.verification_header_company_name || contractData.company_name || ''}
          footerText={contractData.verification_footer_text || contractData.footer_text || ''}
          logoUrl={contractData.logo_url || ''}
          logoSize={(contractData.logo_size as 'small' | 'medium' | 'large') || 'medium'}
          logoPosition={(contractData.logo_position as 'center' | 'left' | 'right') || 'center'}
        />
      );
    case 2:
      return (
        <ContractStep
          clientData={contractData as any}
          currentStep={2}
          button_color={contractData.button_color || undefined}
          icon_color={contractData.icon_color || undefined}
          title_color={contractData.title_color || undefined}
          text_color={contractData.text_color || undefined}
          background_color={contractData.background_color || undefined}
        />
      );
    case 3:
      return (
        <ResellerWelcomeStep
          client_name={contractData.client_name}
          parabens_title={contractData.parabens_title || 'Parabens!'}
          parabens_subtitle={contractData.parabens_subtitle || 'Processo concluido com sucesso!'}
          parabens_description={contractData.parabens_description || 'Sua documentacao foi processada.'}
          parabens_card_color={contractData.parabens_card_color || undefined}
          parabens_background_color={contractData.parabens_background_color || undefined}
          parabens_button_color={contractData.parabens_button_color || contractData.button_color || undefined}
          parabens_text_color={contractData.parabens_text_color || undefined}
          parabens_font_family={contractData.font_family || undefined}
          parabens_form_title={contractData.parabens_form_title || 'Endereco para Entrega'}
          parabens_button_text={contractData.parabens_button_text || 'Confirmar e Continuar'}
          initialAddress={{
            street: contractData.address_street || '',
            number: contractData.address_number || '',
            city: contractData.address_city || '',
            state: contractData.address_state || '',
            zipcode: contractData.address_zipcode || '',
            complement: contractData.address_complement || '',
          }}
        />
      );
    case 4:
      return (
        <ResidenceProofStep
          parabens_card_color={contractData.parabens_card_color || '#1f293d'}
          parabens_background_color={contractData.parabens_background_color || contractData.background_color || '#ffffff'}
          parabens_button_color={contractData.parabens_button_color || contractData.button_color || '#2c3e50'}
          parabens_text_color={contractData.parabens_text_color || '#ffffff'}
          parabens_font_family={contractData.font_family || 'Arial, sans-serif'}
          button_text_color={contractData.button_text_color || '#ffffff'}
        />
      );
    case 5:
      return (
        <AppPromotionStep
          button_color={contractData.button_color || '#000000'}
          button_text_color={contractData.button_text_color || '#ffffff'}
          icon_color={contractData.icon_color || '#d97706'}
          title_color={contractData.title_color || '#171717'}
          text_color={contractData.text_color || '#525252'}
          background_color={contractData.background_color || '#fafafa'}
        />
      );
    default:
      return (
        <div className='min-h-screen flex items-center justify-center' style={{ backgroundColor: contractData.background_color || '#ffffff' }}>
          <div className='text-center'>
            <div className='w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4' style={{ backgroundColor: contractData.button_color || '#22c55e' }}>
              <svg className='w-10 h-10 text-white' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
              </svg>
            </div>
            <h2 className='text-2xl font-bold' style={{ color: contractData.title_color || '#1a1a2e' }}>Processo Concluido!</h2>
            <p className='mt-2' style={{ color: contractData.text_color || '#333' }}>Seu cadastro foi finalizado com sucesso.</p>
          </div>
        </div>
      );
  }
}

export default function AssinaturaClientPage() {
  const location = useLocation();
  const [contractData, setContractDataState] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    const token = pathParts[pathParts.length - 1];
    if (!token || token === 'assinar') {
      setError('Token de acesso nao encontrado na URL.');
      setLoading(false);
      return;
    }
    fetch('/api/assinatura/contracts/' + token + '/full')
      .then(res => {
        if (!res.ok) throw new Error('Contrato nao encontrado');
        return res.json();
      })
      .then(data => {
        const contract = data.contract || data;
        setContractDataState(contract);
        setLoading(false);
      })
      .catch(err => {
        console.error('[AssinaturaClientPage] Erro:', err);
        setError('Contrato nao encontrado ou link invalido.');
        setLoading(false);
      });
  }, [location.pathname]);

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-white'>
        <div className='text-center'>
          <Loader2 className='w-12 h-12 animate-spin mx-auto mb-4 text-gray-400' />
          <p className='text-gray-500'>Carregando...</p>
        </div>
      </div>
    );
  }

  if (error || !contractData) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-white'>
        <div className='text-center px-6'>
          <div className='w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4'>
            <svg className='w-8 h-8 text-red-500' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
            </svg>
          </div>
          <h2 className='text-xl font-bold text-gray-800 mb-2'>Link Invalido</h2>
          <p className='text-gray-500'>{error || 'Este link de assinatura nao e valido ou expirou.'}</p>
        </div>
      </div>
    );
  }

  return (
    <ContractProvider>
      <AssinaturaFlowInner contractData={contractData} />
    </ContractProvider>
  );
}
