import { createFileRoute } from "@tanstack/react-router";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/ajuda")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Central de Ajuda — MiPede" },
      { name: "description", content: "Tire suas dúvidas sobre pedidos, pagamentos, lojas e entregas no MiPede." },
      { property: "og:title", content: "Central de Ajuda — MiPede" },
      { property: "og:description", content: "Dúvidas frequentes de clientes, lojistas e entregadores do MiPede." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type QA = { q: string; a: string };

const CLIENTE: QA[] = [
  { q: "Como faço um pedido?", a: "Escolha uma loja aberta na sua cidade, monte o carrinho, confirme o endereço de entrega e escolha a forma de pagamento (Pix, cartão pelo app, dinheiro na entrega ou cartão na entrega)." },
  { q: "Posso alterar o pedido depois de confirmado?", a: "Não. Depois que o pedido é enviado, não é possível alterar itens, endereço ou forma de pagamento por conta própria — isso existe para proteger tanto você quanto a loja. Se precisar mudar algo, fale com a loja pelo chat do pedido o quanto antes." },
  { q: "Como acompanho a entrega?", a: "Na tela do pedido, você vê o status em tempo real e, quando o entregador estiver a caminho, a localização dele no mapa." },
  { q: "Como falo com a loja ou com o entregador?", a: "Dentro da tela do pedido tem chat direto com a loja e, quando um entregador for atribuído, também com ele — disponíveis enquanto o pedido não for entregue nem cancelado." },
  { q: "Meu pedido veio errado ou com problema, o que faço?", a: "Fale com a loja pelo chat do pedido o quanto antes, explicando o problema." },
  { q: "Preciso estar logado para ver o cardápio das lojas?", a: "Não — você pode navegar e montar o carrinho sem conta. Só é preciso estar logado para finalizar o pedido." },
  { q: "Meus dados de pagamento são seguros?", a: "Sim, o pagamento é processado pelo Mercado Pago; o MiPede não armazena dados do seu cartão." },
];

const LOJISTA: QA[] = [
  { q: "Como cadastro minha loja?", a: "Pelo cadastro de lojista, informando os dados da loja e o CNPJ. Depois de enviado, o cadastro passa por aprovação do administrador antes de ficar visível para os clientes." },
  { q: "Quanto tempo leva a aprovação?", a: "Depende da análise do administrador — acompanhe o status no seu painel." },
  { q: "Como funciona a taxa da plataforma?", a: "A plataforma cobra uma porcentagem sobre cada pedido entregue (a taxa padrão é informada no seu painel financeiro; ela pode variar loja a loja)." },
  { q: "Como faço para sacar meu saldo?", a: "Na aba Financeiro do seu painel, em \"Solicitar saque via PIX\". O primeiro saque de cada semana é gratuito; a partir do segundo, é cobrada uma taxa administrativa de 6% sobre o valor solicitado — o valor da taxa e o líquido a receber são sempre mostrados antes de você confirmar." },
  { q: "Como abro e fecho minha loja para os clientes?", a: "Use a chave \"No ar\" no topo do seu painel para ficar online ou pausar o recebimento de pedidos a qualquer momento." },
  { q: "Como organizo meu cardápio em categorias?", a: "Em Cardápio, você pode criar suas próprias categorias (ex.: \"Pizzas doces\", \"Pizzas salgadas\") e escolher uma delas ao cadastrar ou editar cada produto." },
];

const ENTREGADOR: QA[] = [
  { q: "Como me cadastro como entregador?", a: "Pelo cadastro de entregador, informando CPF, tipo de veículo e placa (quando aplicável). O cadastro passa por aprovação antes de você poder aceitar entregas." },
  { q: "Quanto eu ganho por entrega?", a: "Você recebe 100% da taxa de entrega daquele pedido. O valor que você vai ganhar aparece no card de cada entrega disponível, antes de aceitar." },
  { q: "Como faço para sacar meus ganhos?", a: "Na aba Carteira do seu painel, cadastre sua chave PIX e solicite o saque. O primeiro saque da semana é gratuito; a partir do segundo, é cobrada uma taxa de 6% — sempre mostrada antes de confirmar." },
  { q: "Fui suspenso, o que isso significa?", a: "Sua conta foi temporariamente impedida de aceitar novas entregas pelo administrador. Entre em contato pelo suporte para entender o motivo." },
];

function Section({ title, items, id }: { title: string; items: QA[]; id: string }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <Card className="px-4">
        <Accordion type="single" collapsible>
          {items.map((it, i) => (
            <AccordionItem key={i} value={`${id}-${i}`}>
              <AccordionTrigger className="text-left text-sm font-medium">{it.q}</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{it.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>
    </section>
  );
}

function Page() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Central de Ajuda</h1>
        <p className="text-sm text-muted-foreground">Dúvidas frequentes de clientes, lojistas e entregadores.</p>
      </header>

      <Section id="cliente" title="Cliente" items={CLIENTE} />
      <Section id="lojista" title="Lojista" items={LOJISTA} />
      <Section id="entregador" title="Entregador" items={ENTREGADOR} />

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Contato</h2>
        <Card className="p-4 text-sm">
          Não encontrou o que precisava? Fale com a gente:{" "}
          <a href="mailto:mipedesuport@gmail.com" className="font-medium text-primary hover:underline">mipedesuport@gmail.com</a>
        </Card>
      </section>
    </div>
  );
}
