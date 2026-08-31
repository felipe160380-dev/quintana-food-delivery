# Auditoria do sistema de notificações — MiPede

Somente diagnóstico. Nenhum arquivo, migration, trigger, RPC, RLS ou componente foi alterado.

## 1. Arquitetura atual

**Persistente (banco):** existe apenas UMA tabela de notificações — `store_notifications` (loja). Não existe tabela de notificações para cliente, entregador ou admin.

- Colunas: `store_id, kind, title, body, order_id, read_at, created_at`. Índice `idx_notif_store (store_id, created_at DESC)`. Está na publicação `supabase_realtime`.
- Quem insere (triggers SQL, todos `SECURITY DEFINER`):
  - `notify_store_new_order` (AFTER INSERT em orders) → `new_order`, mas retorna sem inserir quando pix/card_online ainda não estão `paid`.
  - `notify_store_on_payment` (AFTER UPDATE) → `new_order` ("Novo pedido pago") quando payment_status vira `paid`; `order_cancelled` ("Pagamento estornado") quando vira `refunded`.
  - `credit_store_on_delivery` (AFTER UPDATE) → `order_delivered` com o valor líquido; e `order_cancelled` quando o status vira `cancelled`.
  - `notify_store_new_review` (AFTER INSERT em store_reviews) → `new_review`.
- Volume real hoje: new_order 7, order_delivered 6, new_review 4, order_cancelled 4.

**Efêmero (frontend):**
- `src/hooks/use-live-notifications.ts`, montado globalmente em `__root.tsx` (`NotificationsMount`): abre canais Realtime e emite **toast (sonner) + Notification API do navegador (aba aberta) + som/vibração** para o entregador.
- Painel do lojista (`lojista/index.tsx`): canal `store-live:{id}` (contador de não lidas + pedidos pendentes) e canal `store-notifs:{id}` (aba Notificações, listar/marcar todas como lidas).
- Painel do entregador (`entregador/index.tsx`): popup de nova oferta + som + vibração, alimentado por polling da RPC `courier_available_orders` a cada 20s.
- `AppHeader`: contador de mensagens não lidas do chat (RPC `list_customer_conversations`) — é chat, não notificação.

**Push real:** ❌ O aplicativo atualmente não possui Push Notification real para receber avisos com o app fechado. Não há service worker (`public/` só tem ícones e o manifest), nem Push API, VAPID, FCM ou OneSignal. A Notification API usada só funciona com a aba aberta.

**E-mail:** único ponto é `src/routes/api/public/courier-application.ts` (best-effort, chama `api.lovable.dev/v1/emails/send` só se `LOVABLE_API_KEY` existir; falha é apenas logada). Nenhum e-mail para pedido, loja, aprovação/recusa ou saque. ⚠️ NÃO CONFIRMADO — precisa de teste real se a entrega desse e-mail funciona.

## 2. Matriz de eventos (comportamento real)

| Evento | Cliente | Lojista | Entregador | Admin |
|---|---|---|---|---|
| Pedido criado | ❌ (só tela de checkout) | ⚠️ toast Realtime dispara mesmo sem pagamento; persistente só se pago/offline | — | ❌ |
| Pagamento aprovado | ⚠️ toast apenas | ✅ persistente + toast | — | ❌ |
| Pagamento recusado/falhou | ❌ | ❌ | — | ❌ |
| Loja aceitou / em preparo / pronto | ⚠️ toast apenas | — | 🐛 toast global "pedido pronto" sem filtro | ❌ |
| Entregador aceitou | ⚠️ toast apenas | ⚠️ toast apenas | — | ❌ |
| Coletado / a caminho da loja / chegou (courier_stage) | ❌ | ❌ | — | ❌ |
| Saiu para entrega | ⚠️ toast apenas | ⚠️ toast apenas | — | ❌ |
| Entregue | ⚠️ toast apenas | ✅ persistente + toast | ⚠️ toast apenas | ❌ |
| Cancelado | ⚠️ toast apenas | ✅ persistente | ⚠️ toast apenas | ❌ |
| Estorno (refunded) | ❌ | ✅ persistente | — | ❌ |
| Nova avaliação | — | ✅ persistente | — | — |
| Nova oferta de entrega | — | — | ⚠️ popup+som via polling 20s (não Realtime) | — |
| Entregador aguardando aprovação | — | — | ❌ (só e-mail best-effort) | ⚠️ só KPI no /adm |
| Loja aguardando aprovação | — | ❌ (recusa só visível no painel) | — | ⚠️ só KPI |
| Saque solicitado / aprovado / recusado / pago | — | ❌ nenhuma notificação; o motivo da recusa fica em `store_withdrawals.note` e o painel do lojista hoje só mostra o badge de status, não o motivo | — | ❌ nenhum aviso ao admin |

## 3. Problemas encontrados

**🔴 CRÍTICO**
1. `pg_policies.orders_select_participants` — qualquer usuário com papel `courier` pode ler TODO pedido `ready` sem entregador, incluindo `address_snapshot` (endereço completo do cliente) e de **outras cidades**, mesmo suspenso, indisponível ou com entrega ativa. Como `orders` está no Realtime com REPLICA IDENTITY FULL, esses dados chegam ao navegador de qualquer entregador. A RPC `courier_available_orders` filtra corretamente, mas a policy não — e o canal `notif-courier-ready` lê direto da tabela.
2. `src/routes/api/public/courier-application.ts` — endpoint público sem autenticação nem verificação de assinatura que dispara e-mail com dados pessoais informados no corpo; permite spam/forja de candidaturas.

**🟠 ALTO**
3. `use-live-notifications.ts` (bloco `isCourier`) — canal sem filtro: entregador **indisponível**, **suspenso**, **de outra cidade** ou **com entrega ativa** recebe alerta sonoro de "Pedido pronto para retirada"; oferta recusada (`order_offer_declines`) também volta a alertar em qualquer novo UPDATE do pedido.
4. `use-live-notifications.ts` (bloco `isMerchant`, INSERT em orders) — toast "Novo pedido" dispara para pedido Pix/cartão **ainda não pago**. A proteção do banco (`notify_store_new_order`) continua correta, mas o frontend a contorna no nível de toast/aviso sonoro do navegador.
5. Ausência total de notificação de saque (solicitado/aprovado/recusado/pago) para lojista e admin, e ausência de aviso ao admin de cadastros pendentes — operação depende de alguém abrir o painel.
6. Nenhuma notificação de falha de pagamento (`failed`) para cliente nem loja.

**🟡 MÉDIO**
7. Notificações não têm ação de clique: o toast do sonner e a Notification do navegador não navegam para lugar nenhum (`notify()` não define `onClick`/`data`). Só a aba de notificações do lojista tem botão "Abrir" (e ele está correto: `/pedidos/$id?from=lojista&tab=notifs`).
8. Duplicidade de canais no lojista: `store-live:{id}` e `store-notifs:{id}` assinam a mesma tabela, mais o canal `notif-store-{id}` do hook global → uma inserção gera 2 recargas + 1 toast; com o painel aberto o lojista vê toast e a lista recarregando duas vezes.
9. Duplicidade de aviso de "novo pedido pago" ao lojista: trigger de pagamento cria a notificação persistente e o hook global gera toast de UPDATE, além do refresh do contador — três caminhos para o mesmo fato.
10. Contador de não lidas do lojista conta `read_at IS NULL` da loja inteira (correto), mas "marcar como lida" é sempre em massa; não há marcação individual e abrir a aba não marca nada — o badge pode ficar aceso indefinidamente.
11. Oferta do entregador depende de polling de 20s + `seenOffers` em ref; ao trocar de aba/remontar o componente o mesmo pedido pode alertar de novo, e a expiração da janela de 45s só é percebida no próximo polling.
12. `use-live-notifications` roda com `[]` de dependências e resolve o usuário de forma assíncrona: após login/logout/troca de perfil na mesma sessão o hook não é reexecutado (o cleanup só ocorre se o root desmontar). ⚠️ NÃO CONFIRMADO — precisa de teste real de logout→login sem recarregar a página.
13. `AppHeader` assina `messages` sem filtro e refaz a RPC inteira a cada mensagem de qualquer conversa visível ao usuário.

**🟢 BAIXO**
14. Áudio criado com `AudioContext` novo a cada alerta, sem fallback quando o autoplay é bloqueado (o toast serve de fallback visual, mas o lojista não tem som algum para novo pedido — só o entregador tem).
15. `store_notifications` não tem política de retenção nem limpeza; cresce indefinidamente (índice por loja existe, então a leitura segue barata).

## 4. Duplicidades reais

- Mesma inserção em `store_notifications` observada por 3 canais (hook global + 2 canais do painel).
- `notify_store_new_order` e `notify_store_on_payment` não se sobrepõem hoje (o primeiro sai cedo quando não pago), mas ambos geram `kind = 'new_order'`; se um pedido offline algum dia for marcado `paid`, gera duas notificações do mesmo tipo.
- Trigger de banco + detecção de mudança no frontend para pagamento aprovado, entrega concluída e cancelamento.
- Entregador: polling da RPC (popup+som) e canal Realtime global (toast+som) podem alertar o mesmo pedido duas vezes.

## 5. Segurança / RLS

- `store_notifications`: SELECT e UPDATE apenas para `authenticated` dono da loja (`stores.owner_id = auth.uid()`). Não existe policy de INSERT nem DELETE — apenas os triggers `SECURITY DEFINER` inserem. Isolamento entre lojas: correto. Não há `USING (true)`.
- O UPDATE não tem `WITH CHECK` explícito; o Postgres reaproveita o `USING`, então o dono não consegue mover a notificação para outra loja. Risco baixo, mas vale tornar explícito.
- Marcar como lida de outro usuário: bloqueado pela policy.
- Risco real de vazamento está em `orders` (item 1), não na tabela de notificações.

## 6. Privacidade do conteúdo

O `body` das notificações guarda apenas total, valor creditado e nota da avaliação. Não há `delivery_code`, token, cartão, documento nem endereço. ✅ Sem ocorrência.

## 7. Mercado Pago

Webhook e reconciliação alteram `payments` e `orders.payment_status`. A notificação persistente nasce do trigger `notify_store_on_payment`, que só dispara em transição `<> paid → paid`; um segundo processamento (webhook + polling) não repete o UPDATE efetivo, então **a notificação persistente é idempotente**. O toast do frontend, porém, dispara a cada evento Realtime recebido — se dois clientes/abas estiverem abertos, o lojista vê o aviso repetido. `refunded` gera notificação persistente para a loja e nenhuma para o cliente.

## 8. O que está faltando

Notificação persistente para cliente, entregador e admin; avisos de saque (ambos os lados) e o motivo da recusa visível ao lojista; aviso de falha de pagamento; aviso ao admin de aprovações pendentes; ação de clique nas notificações; push real com app fechado.

## 9. Plano de correção proposto (não executado)

- **P0** — restringir a policy de SELECT de `orders` para entregadores (cidade, disponibilidade, suspensão, entrega ativa) e proteger/autenticar `courier-application`; filtrar o canal do entregador no hook.
- **P1** — impedir o toast de "novo pedido" para pedido online não pago; centralizar notificações (tabela genérica por destinatário ou extensão do modelo atual) para cliente/entregador/admin; notificações de saque com motivo da recusa; navegação ao clicar.
- **P2** — remover canais duplicados do lojista, marcar como lida individual/ao abrir, som para novo pedido no lojista, retenção da tabela, e avaliação de push real (service worker + provedor).

## 10. Arquivos que precisariam ser alterados (não alterados)

`src/hooks/use-live-notifications.ts`, `src/routes/__root.tsx`, `src/routes/_authenticated/lojista/index.tsx`, `src/routes/_authenticated/entregador/index.tsx`, `src/routes/_authenticated/adm.tsx`, `src/components/AppHeader.tsx`, `src/routes/api/public/courier-application.ts`, e migrations para policies de `orders`, notificações de saque e (se aprovado) uma tabela de notificações por usuário.

## 11. Escopo estimado

**MÉDIA a GRANDE.** As correções P0 são pequenas e cirúrgicas (uma policy + filtros no hook). O que empurra o escopo para cima é a ausência de qualquer notificação persistente para cliente, entregador e admin: hoje só existe a caixa da loja, então atender os itens P1 significa criar um modelo novo de destinatários, RLS, triggers e uma central de notificações na interface. Push real é um projeto à parte.
