import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/termos")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Termos de Uso — MiPede" },
      { name: "description", content: "Condições de uso da plataforma MiPede para clientes, lojas parceiras e entregadores." },
      { property: "og:title", content: "Termos de Uso — MiPede" },
      { property: "og:description", content: "Regras e condições de uso da plataforma MiPede." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-6 text-base font-bold">{children}</h2>;
}

function Page() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold tracking-tight">Termos de Uso — MiPede</h1>
      <p className="mt-1 text-xs text-muted-foreground">Última atualização: [preencher na publicação]</p>

      <H>1. Aceitação dos termos</H>
      <p className="text-muted-foreground">Ao criar uma conta no MiPede, você declara que leu, entendeu e concorda com estes Termos de Uso e com a Política de Privacidade.</p>

      <H>2. O que é o MiPede</H>
      <p className="text-muted-foreground">O MiPede é uma plataforma de intermediação tecnológica que conecta clientes, lojas parceiras (restaurantes, lanchonetes, etc.) e entregadores independentes. O MiPede não prepara, vende nem entrega os produtos — essa relação é entre o cliente e a loja parceira, com a entrega realizada por um entregador independente. O MiPede também não é responsável pela qualidade, conservação, ou fabricação dos produtos vendidos pelas lojas parceiras.</p>

      <H>3. Cadastro</H>
      <p className="text-muted-foreground">Cada usuário é responsável pela veracidade das informações fornecidas no cadastro (dados pessoais, CNPJ, documentos). Contas de lojista e entregador passam por análise de aprovação antes de operar na plataforma.</p>

      <H>4. Pedidos e pagamento</H>
      <p className="text-muted-foreground">Ao confirmar um pedido, o cliente autoriza a cobrança pelo meio de pagamento escolhido. Preços e taxa de entrega são informados antes da confirmação do pedido. Após confirmado, o pedido não pode ser alterado unilateralmente — qualquer ajuste deve ser negociado diretamente com a loja pelo chat do pedido.</p>

      <H>5. Taxas</H>
      <p className="text-muted-foreground">O MiPede cobra uma taxa de intermediação sobre os pedidos processados na plataforma, e uma taxa administrativa sobre saques de saldo (com uma quantidade de saques gratuitos por semana, informada no painel financeiro de cada loja e entregador). Essas taxas podem ser ajustadas, com aviso prévio no app.</p>

      <H>6. Cancelamentos e reembolsos</H>
      <p className="text-muted-foreground">Cancelamentos e reembolsos são analisados caso a caso, considerando o estágio do pedido no momento da solicitação. Entre em contato pelo chat do pedido ou pelo suporte.</p>

      <H>7. Responsabilidades do lojista</H>
      <p className="text-muted-foreground">O lojista é responsável pela qualidade, conservação, precificação, disponibilidade e conformidade legal e sanitária dos produtos anunciados, bem como pela emissão de documentos fiscais quando aplicável.</p>

      <H>8. Responsabilidades do entregador</H>
      <p className="text-muted-foreground">O entregador é um prestador de serviço independente, não empregado do MiPede, responsável por realizar a entrega de forma segura e dentro do prazo informado.</p>

      <H>9. Conduta proibida</H>
      <p className="text-muted-foreground">É proibido: usar a plataforma para fins ilegais; fornecer informações falsas no cadastro; tentar contornar as regras de pagamento ou taxas da plataforma; assediar ou agredir outros usuários, lojistas ou entregadores.</p>

      <H>10. Suspensão e encerramento de conta</H>
      <p className="text-muted-foreground">O MiPede pode suspender ou encerrar contas que violem estes termos, mediante análise.</p>

      <H>11. Limitação de responsabilidade</H>
      <p className="text-muted-foreground">O MiPede atua como intermediário tecnológico e não se responsabiliza por danos decorrentes da relação entre cliente, loja e entregador, exceto por falhas comprovadamente atribuíveis à própria plataforma.</p>

      <H>12. Alterações nestes termos</H>
      <p className="text-muted-foreground">Podemos atualizar estes termos periodicamente, com aviso dentro do app.</p>

      <H>13. Legislação aplicável</H>
      <p className="text-muted-foreground">Estes termos são regidos pelas leis da República Federativa do Brasil.</p>

      <H>14. Contato</H>
      <p className="text-muted-foreground"><a href="mailto:mipedesuport@gmail.com" className="font-medium text-primary hover:underline">mipedesuport@gmail.com</a></p>
    </div>
  );
}
