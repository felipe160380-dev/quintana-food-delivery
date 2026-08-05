# Painel admin detalhado + categorias do lojista + validações

Estou em modo de planejamento, então preciso da sua aprovação antes de executar. Abaixo o plano exato, na ordem das 7 seções que você pediu, com dois pontos que precisam da sua decisão.

## Pontos que preciso confirmar

1. **Ícone do "Twitter" no rodapé (`/adm-login`)**: confirmado que hoje é um atalho disfarçado para o login do admin. Não vou mexer nele — só troco o Instagram, como você pediu.
2. **Onde ficam os formulários de cadastro citados**: `tornar-se-entregador.tsx` e `tornar-se-lojista.tsx` hoje são apenas redirecionamentos para `/auth` (não têm formulário). Os cadastros reais estão em:
   - Entregador: `src/routes/auth.tsx` (bloco de cadastro com CPF, veículo, placa) → é ali que entra o upload de foto.
   - CNPJ da loja: `src/routes/_authenticated/lojista/index.tsx` (criação da loja, linha ~221, e edição, linha ~367) → é ali que entra a validação de 14 dígitos.

## Seção 1 — Detalhe da loja (admin)

Nova rota `src/routes/_authenticated/adm.lojas.$id.tsx`. O card em `StoresTab` passa a ter o nome clicável levando à tela; todas as ações atuais (aprovar/rejeitar/ativar/desativar/excluir) permanecem no card.

A tela contém: formulário de edição do cadastro (nome, descrição, categoria, cidade, CNPJ, endereço, contato), campo `platform_fee_pct` com validação 0–100 e texto explicando que é a taxa específica dessa loja, lista de pedidos com filtro de status (incluindo cancelados) e período, lista de saques (`store_withdrawals`) com filtro de status e período, e resumo do período (total vendido, nº de pedidos, ticket médio).

## Seção 2 — Detalhe do entregador (admin)

Migration: `ALTER TABLE public.couriers ADD COLUMN photo_url text`.

Upload de foto no cadastro do entregador em `src/routes/auth.tsx`, reaproveitando `ImageUpload` (bucket `avatars`), gravando em `couriers.photo_url`.

Nova rota `src/routes/_authenticated/adm.entregadores.$id.tsx`: foto, dados de cadastro (documento, veículo, placa, telefone e nome via `profiles`), status de aprovação, entregas concluídas com endereço (`orders.address_snapshot`) e data/hora, e relatório de ganhos por período (`courier_wallet_entries` / `courier_withdrawals`).

Em `CouriersTab`: nova ação suspender/reativar entregador já aprovado, sem tocar na lógica de aprovação/rejeição. Vou usar `couriers.is_available` como chave de suspensão, ou, se você preferir uma suspensão que o próprio entregador não possa desfazer, adiciono na mesma migration uma coluna `is_suspended boolean not null default false` (recomendado — evito depender de um campo que o entregador controla).

## Seção 3 — Detalhe do usuário (admin)

Nova rota `src/routes/_authenticated/adm.usuarios.$id.tsx`: nome, e-mail, telefone, papéis, data de cadastro e histórico de pedidos quando for cliente. Item da lista em `UsersTab` vira clicável.

## Seção 4 — Categorias reutilizáveis

Migration: `public.product_categories` (id, store_id, name, sort_order, created_at, updated_at) com GRANTs e RLS espelhando `products` (só o dono da loja gerencia; leitura pública das lojas aprovadas se `products` já for assim).

No painel do lojista: tela simples de gerenciar categorias (criar, renomear, reordenar, excluir) e, no formulário de produto, troca do campo de texto livre por lista suspensa com opção "nova categoria" inline. Produtos antigos com texto livre ficam como estão.

## Seção 5 — Filtro por cidade no admin

Em `StoresTab`, lista suspensa com as cidades distintas presentes em `stores.city`, ao lado do filtro de status já existente.

## Seção 6 — Validações

E-mail com formato válido no cadastro (`src/routes/auth.tsx`) e CNPJ com exatamente 14 dígitos numéricos nos campos de CNPJ do painel do lojista (criação e edição), com mensagens claras. Sem cálculo de dígito verificador.

## Seção 7 — Instagram

`src/components/Footer.tsx`: `href` do Instagram para o perfil informado, com `target="_blank" rel="noopener noreferrer"`. Ícone do "Twitter" intocado.

## Execução e validação

Uma seção por vez, com `tsgo` após cada uma. As migrations das seções 2 e 4 vão para aprovação separadamente. Ao final: teste dos fluxos de admin, lojista e cadastro, e confirmação de que aprovação, carteira, chat e checkout continuam intactos.
