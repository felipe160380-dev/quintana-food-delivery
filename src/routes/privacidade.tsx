import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Política de Privacidade — MiPede" },
      { name: "description", content: "Saiba quais dados o MiPede coleta, por que coleta, com quem compartilha e quais são os seus direitos." },
      { property: "og:title", content: "Política de Privacidade — MiPede" },
      { property: "og:description", content: "Como o MiPede trata os seus dados pessoais." },
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
    <div className="mx-auto max-w-2xl px-4 py-8 text-sm leading-relaxed text-muted-foreground">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Política de Privacidade — MiPede</h1>
      <p className="mt-1 text-xs">Última atualização: [preencher na publicação]</p>

      <div className="text-foreground">
        <H>1. Quem somos</H>
        <p className="text-muted-foreground">O MiPede é uma plataforma que conecta clientes, lojas parceiras e entregadores para pedidos de delivery. Esta política explica quais dados coletamos, por que coletamos, com quem compartilhamos e quais são os seus direitos.</p>

        <H>2. Quais dados coletamos</H>
        <p className="text-muted-foreground">De todos os usuários: nome, e-mail, telefone, senha (armazenada de forma criptografada). De clientes: endereços de entrega cadastrados. De lojistas: dados da loja, CNPJ, endereço comercial, chave PIX para recebimento. De entregadores: CPF, tipo de veículo e placa (quando aplicável), foto de cadastro, chave PIX para recebimento, e localização em tempo real enquanto uma entrega estiver em andamento (para permitir o rastreamento do pedido pelo cliente e pela loja). Dados de pagamento: o MiPede não armazena número de cartão de crédito nem dados sensíveis de pagamento — isso é processado diretamente pelo Mercado Pago. Dados de uso: histórico de pedidos, mensagens trocadas no chat de cada pedido, avaliações.</p>

        <H>3. Por que coletamos esses dados</H>
        <p className="text-muted-foreground">Usamos esses dados para: viabilizar a compra e entrega de pedidos; processar pagamentos; permitir a comunicação entre cliente, loja e entregador; calcular e repassar valores devidos a lojas e entregadores; cumprir obrigações legais e fiscais; prevenir fraude; e melhorar o funcionamento da plataforma.</p>

        <H>4. Com quem compartilhamos seus dados</H>
        <p className="text-muted-foreground">Mercado Pago (processamento de pagamentos). Google Maps (cálculo de rotas e exibição de localização para entrega). A loja e o entregador envolvidos em cada pedido recebem os dados necessários para executar aquele pedido específico (endereço de entrega, itens, contato). Não vendemos seus dados a terceiros para fins de publicidade.</p>

        <H>5. Por quanto tempo guardamos seus dados</H>
        <p className="text-muted-foreground">Mantemos os dados enquanto sua conta estiver ativa e pelo período necessário para cumprir obrigações legais (fiscais, por exemplo), mesmo após a exclusão da conta, quando exigido por lei.</p>

        <H>6. Seus direitos (Lei Geral de Proteção de Dados — Lei 13.709/2018)</H>
        <p className="text-muted-foreground">Você tem direito a: confirmar se tratamos seus dados; acessar os dados que temos sobre você; corrigir dados incompletos ou incorretos; solicitar a exclusão dos seus dados (respeitadas as obrigações legais de retenção); revogar seu consentimento; e solicitar a portabilidade dos seus dados. Para exercer qualquer um desses direitos, entre em contato pelo e-mail: <a href="mailto:mipedesuport@gmail.com" className="font-medium text-primary hover:underline">mipedesuport@gmail.com</a></p>

        <H>7. Segurança</H>
        <p className="text-muted-foreground">Adotamos medidas técnicas para proteger seus dados, incluindo controle de acesso por permissão (cada pessoa só acessa os dados relacionados a ela) e conexões criptografadas. Nenhum sistema é 100% imune a incidentes; caso ocorra um incidente de segurança relevante, comunicaremos conforme exigido por lei.</p>

        <H>8. Menores de idade</H>
        <p className="text-muted-foreground">O MiPede não é destinado a menores de 18 anos. Não coletamos intencionalmente dados de menores.</p>

        <H>9. Cookies e armazenamento local</H>
        <p className="text-muted-foreground">Usamos armazenamento local do navegador (localStorage) para manter seu carrinho de compras entre sessões. Isso não é compartilhado com terceiros para fins de publicidade.</p>

        <H>10. Alterações nesta política</H>
        <p className="text-muted-foreground">Podemos atualizar esta política periodicamente. Alterações relevantes serão comunicadas dentro do app.</p>

        <H>11. Contato</H>
        <p className="text-muted-foreground">Dúvidas sobre esta política ou sobre seus dados: <a href="mailto:mipedesuport@gmail.com" className="font-medium text-primary hover:underline">mipedesuport@gmail.com</a></p>
      </div>
    </div>
  );
}
