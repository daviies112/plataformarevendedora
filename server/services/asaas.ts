import fetch from 'node-fetch';

const ASAAS_API_URL = process.env.ASAAS_SANDBOX === 'true'
  ? 'https://api-sandbox.asaas.com/v3'
  : 'https://api.asaas.com/v3';

export interface AsaasSplit {
  walletId: string;
  fixedValue?: number;
  percentualValue?: number;
}

export class AsaasService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ASAAS_API_KEY || '';
    if (!this.apiKey) console.warn('[Asaas] Nenhuma API key configurada');
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'access_token': this.apiKey,
      'User-Agent': 'nexus-plataforma/1.0',
    };
  }

  private async request<T>(endpoint: string, method = 'GET', body?: any): Promise<T> {
    const resp = await fetch(ASAAS_API_URL + endpoint, {
      method,
      headers: this.headers as any,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await resp.json() as any;
    if (!resp.ok) throw new Error(data.errors?.[0]?.description || JSON.stringify(data));
    return data as T;
  }

  async getOrCreateCustomer(name: string, cpfCnpj: string, email?: string): Promise<string> {
    const clean = cpfCnpj.replace(/\D/g, '');
    const list = await this.request<any>('/customers?cpfCnpj=' + clean);
    if (list.data?.length > 0) return list.data[0].id;
    const created = await this.request<any>('/customers', 'POST', {
      name, cpfCnpj: clean, email, notificationDisabled: true
    });
    return created.id;
  }

  async createPixPayment(params: {
    customerId: string; value: number; dueDate: string;
    description?: string; externalReference?: string; split?: AsaasSplit[];
  }) {
    return this.request<any>('/payments', 'POST', {
      customer: params.customerId, billingType: 'PIX',
      value: params.value, dueDate: params.dueDate,
      description: params.description, externalReference: params.externalReference,
      split: params.split,
    });
  }

  async getPixQrCode(paymentId: string) {
    return this.request<any>(`/payments/${paymentId}/pixQrCode`);
  }

  // FIX: installmentCount so enviado para parcelamento (> 1). Para pagamento a vista,
  // a Asaas rejeita installmentCount:1 pois exige installmentValue junto.
  async createCreditCardPayment(params: {
    customerId: string; value: number; dueDate: string;
    description?: string; externalReference?: string;
    creditCardToken: string; installmentCount?: number; split?: AsaasSplit[];
  }) {
    const count = params.installmentCount && params.installmentCount > 1 ? params.installmentCount : undefined;
    const body: any = {
      customer: params.customerId, billingType: 'CREDIT_CARD',
      value: params.value, dueDate: params.dueDate,
      description: params.description, externalReference: params.externalReference,
      creditCardToken: params.creditCardToken,
      split: params.split,
    };
    if (count) {
      body.installmentCount = count;
      body.installmentValue = parseFloat((params.value / count).toFixed(2));
    }
    return this.request<any>('/payments', 'POST', body);
  }

  async tokenizeCreditCard(params: {
    customerId: string; holderName: string; number: string;
    expiryMonth: string; expiryYear: string; ccv: string; remoteIp: string;
    // FIX: campos obrigatorios creditCardHolderInfo
    cpfCnpj?: string; postalCode?: string; addressNumber?: string; phone?: string; email?: string;
  }) {
    return this.request<any>('/creditCard/tokenize', 'POST', {
      customer: params.customerId,
      creditCard: {
        holderName: params.holderName, number: params.number,
        expiryMonth: params.expiryMonth, expiryYear: params.expiryYear, ccv: params.ccv,
      },
      creditCardHolderInfo: {
        name: params.holderName,
        email: params.email,
        cpfCnpj: params.cpfCnpj,
        postalCode: params.postalCode,
        addressNumber: params.addressNumber,
        phone: params.phone,
      },
      remoteIp: params.remoteIp,
    });
  }

  // FIX: birthDate adicionado (obrigatorio para MEI/pessoa fisica)
  async createSubAccount(params: {
    name: string; email: string; cpfCnpj: string; companyType?: string;
    mobilePhone: string; address: string; addressNumber: string; postalCode: string;
    birthDate?: string; // YYYY-MM-DD, obrigatorio para pessoa fisica/MEI
    incomeValue?: number;
  }) {
    return this.request<any>('/accounts', 'POST', params);
  }

  // FIX: endpoint correto para walletId e myAccount
  async getMyAccount() {
    return this.request<any>('/myAccount');
  }

  async getWalletId(): Promise<string> {
    // O walletId nao tem endpoint proprio no v3 - vem do myAccount ou do cadastro da subconta
    const data = await this.request<any>('/myAccount');
    return data.id; // No Asaas, o walletId da conta mae eh o proprio account id
  }

  async getPayment(paymentId: string) {
    return this.request<any>(`/payments/${paymentId}`);
  }

  async cancelPayment(paymentId: string) {
    return this.request<any>(`/payments/${paymentId}`, 'DELETE');
  }

  async createDunning(paymentId: string, type: 'SERASA' | 'CREDIT_BUREAU' | 'EXTRAJUDICIAL' = 'SERASA') {
    return this.request<any>('/paymentDunnings', 'POST', { payment: paymentId, type });
  }

  async cancelDunning(dunningId: string) {
    return this.request<any>(`/paymentDunnings/${dunningId}`, 'DELETE');
  }

  async createSubscription(params: {
    customerId: string; billingType: string; value: number;
    nextDueDate: string; cycle: string; description?: string; split?: AsaasSplit[];
  }) {
    return this.request<any>('/subscriptions', 'POST', {
      customer: params.customerId, billingType: params.billingType,
      value: params.value, nextDueDate: params.nextDueDate,
      cycle: params.cycle, description: params.description, split: params.split,
    });
  }

  async getBalance() {
    return this.request<any>('/finance/balance');
  }

  isConfigured(): boolean { return !!this.apiKey; }
}

export const asaasService = new AsaasService();
