import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { ClipboardCheck, Send, CheckCircle2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function DiagnosticoVendas() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [plano, setPlano] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Mocking API call to /api/gaps/diagnostico/gerar-plano
    try {
      const formData = new FormData(e.target as HTMLFormElement);
      const respostas = Object.fromEntries(formData.entries());
      
      const response = await fetch('/api/gaps/diagnostico/gerar-plano', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respostas })
      });
      
      const data = await response.json();
      if (data.plano) {
        setPlano(data.plano);
        setSubmitted(true);
        toast({ title: 'Diagnóstico concluído', description: 'Seu plano de ação foi gerado!' });
      }
    } catch (error) {
      toast({ title: 'Erro', description: 'Não foi possível gerar seu plano.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className='max-w-2xl mx-auto space-y-6 py-8'>
        <Card className='border-2 border-green-500/50 bg-green-500/5'>
          <CardHeader className='text-center'>
            <div className='mx-auto h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4'>
              <CheckCircle2 className='h-10 w-10 text-green-500' />
            </div>
            <CardTitle className='text-2xl font-bold'>Seu Plano de Ação</CardTitle>
            <CardDescription>Com base no seu perfil, aqui está o que sugerimos:</CardDescription>
          </CardHeader>
          <CardContent className='text-center space-y-6'>
            <div className='p-6 bg-background rounded-xl border-2 font-medium text-lg italic'>
              \"{plano}\"
            </div>
            <Button onClick={() => setSubmitted(false)} variant='outline'>Realizar novo diagnóstico</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='max-w-2xl mx-auto space-y-6 py-8'>
      <div className='flex items-center gap-3'>
        <div className='h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center'>
          <ClipboardCheck className='h-6 w-6 text-primary' />
        </div>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>Diagnóstico de Vendas</h1>
          <p className='text-muted-foreground'>Responda algumas perguntas para turbinar seus resultados.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className='border-2'>
          <CardContent className='space-y-8 pt-8'>
            <div className='space-y-4'>
              <Label className='text-lg font-bold'>1. Qual sua maior dificuldade hoje?</Label>
              <RadioGroup name='dificuldade' defaultValue='clientes'>
                <div className='flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent'>
                  <RadioGroupItem value='clientes' id='r1' />
                  <Label htmlFor='r1' className='flex-1 cursor-pointer'>Encontrar novos clientes</Label>
                </div>
                <div className='flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent'>
                  <RadioGroupItem value='tempo' id='r2' />
                  <Label htmlFor='r2' className='flex-1 cursor-pointer'>Falta de tempo para visitar</Label>
                </div>
                <div className='flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent'>
                  <RadioGroupItem value='preco' id='r3' />
                  <Label htmlFor='r3' className='flex-1 cursor-pointer'>Clientes acham as peças caras</Label>
                </div>
              </RadioGroup>
            </div>

            <div className='space-y-4'>
              <Label className='text-lg font-bold'>2. Como você divulga suas peças?</Label>
              <RadioGroup name='divulgacao' defaultValue='whatsapp'>
                <div className='flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent'>
                  <RadioGroupItem value='whatsapp' id='d1' />
                  <Label htmlFor='d1' className='flex-1 cursor-pointer'>WhatsApp e Status</Label>
                </div>
                <div className='flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent'>
                  <RadioGroupItem value='instagram' id='d2' />
                  <Label htmlFor='d2' className='flex-1 cursor-pointer'>Instagram (Posts e Reels)</Label>
                </div>
                <div className='flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent'>
                  <RadioGroupItem value='boca_a_boca' id='d3' />
                  <Label htmlFor='d3' className='flex-1 cursor-pointer'>Boca a boca / Visitas presenciais</Label>
                </div>
              </RadioGroup>
            </div>

            <div className='space-y-4'>
              <Label className='text-lg font-bold'>Conte-nos um pouco mais sobre sua rotina:</Label>
              <Textarea name='comentario' placeholder='Ex: Tenho outro emprego, vendo apenas nos finais de semana...' className='min-h-[100px]' />
            </div>

            <Button type='submit' className='w-full h-12 font-bold text-lg' disabled={loading}>
              {loading ? <Loader2 className='mr-2 h-5 w-5 animate-spin' /> : <Send className='mr-2 h-5 w-5' />}
              {loading ? 'Gerando Plano...' : 'Gerar meu Plano de Ação'}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
