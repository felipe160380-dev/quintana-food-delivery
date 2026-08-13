# Auditoria técnica — MiPede/QuintanaFood (diagnóstico, sem alterações)

Tudo abaixo foi verificado lendo o código atual e consultando o banco. O que não deu para confirmar está marcado como **NÃO CONFIRMADO — precisa de teste**.

## Dados reais do banco (hoje)

- `payments`: **0 registros**. Nenhum pagamento Mercado Pago foi persistido até agora.
- `orders`: nenhum pedido com `payment_status = 'paid'`. Pix: 3 pendentes + 4 cancelados + 1 entregue (todos `payment_status = pending`). Cartão online: 1 pendente.
- Entregadores: 2 — um aprovado (cidade A, `is_available = false`), um pendente.
- Pedido `ready` sem entregador: 1, na mesma cidade do entregador aprovado.
- Lojas: 3 aprovadas, apenas 1 online.

## 1. Fluxo principal do pedido

| Etapa | Situação |
| --- | --- |
| Carrinho → checkout | Funcionando |
| Criação do pedido (`create_order`) | Funcionando (preço recalculado no servidor, valida loja online, forma de pagamento, estoque, pedido mínimo) |
| Pagamento na entrega | Funcionando |
| Pagamento online (Pix/cartão) | **Quebrado na prática** (ver seção 2) |
| Loja confirmar → preparo → pronto | Funcionando para pagamento na entrega |
| Pedido pronto → entregador | Funcionando parcialmente (ver seção 3) |
| Etapas da entrega + código de 4 dígitos | Funcionando |
| Conclusão + crédito nas carteiras | Funcionando (triggers `credit_store_on_delivery` e `credit_courier_on_delivery`) |

## 2. Pagamento online não chega para a loja — causa identificada

São **dois** problemas somados:

1. **Filtro do painel do lojista.** Em `lojista/index.tsx` todas as consultas de pedidos usam
   `PAID_OR_OFFLINE = payment_status.eq.paid, payment_method.in.(cash_on_delivery,card_on_delivery)`.
   Ou seja: pedido Pix/cartão online **só aparece para a loja depois de `payment_status = 'paid'`**. Isso é intencional (evita liberar pedido não pago), mas hoje nada nunca vira `paid`.
2. **Nenhum pagamento é registrado.** A tabela `payments` está vazia e nenhum pedido Pix ficou `paid`. Isso indica que ou o Pix não está sendo criado (erro em `createPixForOrder` / `MP_ACCESS_TOKEN`), ou o cliente fecha o modal sem pagar, ou o webhook nunca chega/valida. O código do webhook em si está correto (HMAC obrigatório, upsert idempotente por `provider+external_id`, atualiza `payment_status`).
   **NÃO CONFIRMADO — precisa de teste:** qual dos três está falhando. Verificar (a) se a URL do webhook está cadastrada no painel Mercado Pago apontando para `/api/public/mp-webhook`, (b) logs de erro de `createPixForOrder`, (c) se `MP_WEBHOOK_SECRET` corresponde à chave secreta da notificação.

Não há problema de RLS aqui: a policy da loja em `orders` é por `store_id` do dono e está correta. Realtime do lojista existe.

## 3 e 4. Entregadores

O que **existe e funciona**: policy que deixa entregador ver pedidos `ready` sem entregador; aceitar vincula `courier_id`; etapas `accepted → to_store → at_store → picked_up → to_customer → at_customer` via `courier_set_stage`; mapa; código de 4 dígitos em `confirm_delivery`; crédito da taxa de entrega; chat com o cliente.

Por que **não aparece pedido hoje**: o único entregador aprovado está com `is_available = false`. Com o botão desligado a tela mostra "Você está indisponível" e **não lista nada**, mesmo havendo pedido pronto na mesma cidade. Confirmado no banco e no código.

O que **falta** no fluxo "encontrar entregador":
- Não há notificação (push/som/toast) de nova entrega disponível — só realtime silencioso.
- Não há uso de distância/localização para ordenar ou selecionar entregador. É modelo "puxa quem ver primeiro".
- Não há reserva/expiração: dois entregadores podem tentar aceitar o mesmo pedido (a corrida é resolvida pela trigger, mas sem mensagem clara).

## 5. Segurança do pedido — está protegido

Confirmado no código das funções e triggers:
- Preços, `subtotal`, `total` e `delivery_fee` são calculados no servidor em `create_order`.
- `orders_guard_transitions` bloqueia alteração de `total`, `subtotal`, `delivery_fee`, `payment_status`, `payment_method`, `store_id`, `customer_id`, `address_snapshot` e `delivery_code` por qualquer usuário.
- Cliente só pode cancelar quando `pending`. Loja só avança em transições válidas e é impedida de aceitar Pix/cartão online sem `paid`. Entregador só conclui via `confirm_delivery` com código.
- **Conclusão: um cliente não consegue manipular preço, status ou pagamento pela API.**

## 6. Mercado Pago

Correto: HMAC obrigatório (recusa sem segredo), idempotência por `X-Idempotency-Key` e upsert único, reaproveita Pix pendente, estorno cancela o pedido. Risco encontrado: se o webhook nunca chega, **o pedido Pix pago pelo cliente fica invisível para a loja para sempre** — não há reconciliação/polling de status. Nenhum caso de pedido aparecendo como pago sem pagamento.

## 7. Painel do lojista

Dashboard, Pedidos, Cardápio, Minha loja, Financeiro, Avaliações, Relatórios e Notificações existem. O redirecionamento indevido para "Meus pedidos / Você ainda não fez pedidos" **não foi reproduzido no código**: a tela do pedido é role-aware e o botão voltar do lojista aponta para o painel. **NÃO CONFIRMADO — precisa de teste** com conta de lojista real.

## 8. Carrinho e checkout

Adicionar produto, adicionais, quantidade e carrinho por usuário estão implementados; barras fixas usam o utilitário `floating-bottom`. O botão "Fazer pedido" está na barra fixa do checkout. Cenário residual: se o pedido mínimo não for atingido, o botão continua visível e mostra erro — ok. **Responsividade real em 320/360/390/430px: NÃO CONFIRMADO — precisa de teste visual** (seção 19).

## 9. Endereços

Cliente: número obrigatório (aceita "S/N"), edição e geolocalização via LocationPicker — implementado. Loja: número exigido no cadastro — implementado. Coordenadas gravadas em `latitude/longitude`.

## 10, 11, 17. Admin e exclusão de conta

Lista de usuários com e-mail, cidade, papéis, filtros **Todos | Clientes | Lojistas | Entregadores**, busca e ativar/desativar: implementados (`admin_list_users`, `admin_set_user_active`). Exclusão de loja é **arquivamento** (`archive_store`), não exclusão física. Exclusão de usuário pelo admin: existe desativação, **não** exclusão definitiva. `delete_my_account` existe e é usado no menu, seguido de logout e volta para a home — implementado.

## 12, 13, 14. Produtos, categorias, novo cliente

- Preços usam `CurrencyInput` com máscara BRL; não aceita texto. **Não há validação explícita de preço 0 nem teto máximo** — preço zero é aceito.
- Cliente: barra horizontal de categorias rolável na página da loja com rolagem até a seção. Lojista: `CategoriesManager` + select no produto. Implementado.
- Tag "Novo cliente" / contagem de pedidos do cliente na loja: implementado (`customer_orders_count`).

## 15. Cadastro do entregador — incompleto

Existe hoje: nome, telefone, e-mail, senha, CPF, veículo, placa, cidade, status "em análise" e bloqueio até aprovação (confirmado na tela do entregador).
**Falta**: upload de CNH, CRLV e foto 3x4/perfil (as colunas `cnh_url`, `crlv_url`, `photo_url` e o bucket `courier-docs` existem mas **não são usados em nenhum lugar do app**), e marca/modelo/ano da moto (colunas existem, sem formulário). Cadastro é uma etapa só, não três.

## 16. Localização do entregador

Existe `use-courier-location-share` gravando posição em `order_courier_locations` e o cliente lê em tempo real. Só transmite quando há entrega `out_for_delivery`. **Não** mantém localização quando o entregador está apenas disponível, **não** calcula distância até a loja e **não** é usada para selecionar entregador. Funcionamento real da permissão de GPS: **NÃO CONFIRMADO — precisa de teste em dispositivo**.

## 18. FAQ

`/ajuda` existe com FAQ por perfil, mas está **apenas no rodapé**. Não aparece no menu superior junto de "Meus pedidos / Conversas / Endereços". Melhor local: item "Ajuda" no dropdown do `AppHeader`, visível para os três perfis.

## 19. Responsividade

**NÃO CONFIRMADO — precisa de teste visual.** Não há como afirmar sobreposição, corte ou z-index sem capturar as telas nos breakpoints. Recomendo uma passagem de screenshots em 320/360/390/430/tablet/desktop nas telas: loja, checkout, painel do lojista (abas), painel do entregador e /adm.

## 20. Segurança geral

| Nível | Item |
| --- | --- |
| ALTO | Pedido Pix pago sem webhook fica invisível para a loja (perda de venda, não vazamento) |
| MÉDIO | Sem reconciliação de pagamentos; sem expiração de pedido Pix não pago |
| BAIXO | Preço zero aceito no cadastro de produto |
| OK | RLS em todas as tabelas, papéis em `user_roles` com `has_role`, webhook com HMAC obrigatório, segredos apenas no servidor, admin verificado no banco |

Nenhuma exposição de dados pessoais ou manipulação de status/pagamento pelo cliente foi encontrada.

## Tabela final

| Prioridade | Problema | Área | Situação | Causa | Correção necessária |
| --- | --- | --- | --- | --- | --- |
| 1 | Pedido Pix/cartão nunca fica pago | Pagamento | Quebrado | `payments` vazio; webhook/criação de pagamento não conclui | Testar criação do Pix e cadastro do webhook; adicionar verificação de status sob demanda |
| 2 | Pedido online não aparece para a loja | Lojista | Quebrado (consequência do 1) | Filtro exige `paid` | Após corrigir 1, mostrar pedido aguardando pagamento em aba separada |
| 3 | Entregador não vê pedidos | Entregador | Funciona só com "Disponível" ligado | Lista escondida quando indisponível | Mostrar aviso claro e contagem de pedidos aguardando |
| 4 | Sem notificação de nova entrega | Entregador | Faltando | Não implementado | Alerta sonoro/visual ao surgir pedido pronto |
| 5 | Cadastro do entregador sem documentos | Entregador | Incompleto | Etapas 2 e 3 não existem | Formulário em 3 etapas com upload no bucket `courier-docs` |
| 6 | FAQ fora do menu superior | UX | Faltando | Só no rodapé | Item "Ajuda" no menu |
| 7 | Admin não exclui usuário/loja de fato | Admin | Parcial | Só desativa/arquiva | Definir se exclusão definitiva é desejada |
| 8 | Preço zero aceito | Produtos | Parcial | Sem validação mínima | Exigir valor maior que zero |
| 9 | Responsividade | Interface | Não verificado | — | Auditoria visual por breakpoint |

### Bloqueadores para lançamento
1. Pagamento online não conclui (Pix/cartão) e pedido pago não chega à loja.
2. Entregador sem notificação/visibilidade confiável de novas entregas.

### Importantes antes do lançamento
Cadastro completo do entregador com documentos; FAQ no menu; validação de preço mínimo; auditoria visual de responsividade; expiração de pedido Pix não pago.

### Pós-lançamento
Seleção de entregador por distância, localização contínua quando disponível, exclusão definitiva de contas pelo admin, reconciliação automática de pagamentos.

### Já está bom
`create_order` e proteção de preços/status por triggers; RLS e papéis; webhook com HMAC e idempotência; fluxo de etapas do entregador com código de 4 dígitos; carteiras de loja e entregador com regra de saque; chat separado loja/entregador; conversas com não lidas; endereços com número obrigatório; categorias no cardápio; tag de novo cliente; painel admin com filtros.

## PRONTO PARA CORREÇÃO

Cinco primeiros, em ordem:
1. Diagnosticar e corrigir o pagamento online ponta a ponta (criação do Pix + webhook + `payment_status`).
2. Tornar visível para a loja o pedido online "aguardando pagamento", sem permitir aceitar antes de pago.
3. Corrigir a visibilidade de entregas para o entregador (aviso quando indisponível + contagem de pedidos prontos).
4. Notificação de nova entrega disponível para o entregador.
5. Cadastro do entregador em 3 etapas com upload de CNH, CRLV e foto.
