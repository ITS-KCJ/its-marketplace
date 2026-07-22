---
description: Gate de revisão pré-merge ITS. Rápido por padrão, aprofunda sozinho ao detectar risco. Universal (NEXUS, LUMEN Portal, LUMEN Gerencial, HERMES). Não aplica patch, exige evidência para bloquear.
---

# ITS Pre-Merge Review

Gate de revisão antes de merge, homologação ou promoção para produção. Serve a qualquer projeto ITS. Itens marcados **(multi-tenant)** valem só onde há isolamento por organização/cliente/tenant.

Esta revisão é a camada FINA específica da ITS. Ela NÃO substitui caça genérica de bug. Para isso, delegue a `/gsd-code-review`. Aqui o foco é: hard-stops, multi-tenant, regressões conhecidas do código ITS, e política HML-first.

## Passo 1 — Obter o diff sozinho

Não espere o usuário colar o diff. Tente obter automaticamente.

Repos conhecidos (base `C:\dev\projetos\`):
- NEXUS: `C:\dev\projetos\nexus` (raiz git; não existe mais `nexus/lumen`; base `master`)
- LUMEN Portal: `C:\dev\projetos\lumen-portal` (base `main`)
- LUMEN Gerencial: `C:\dev\projetos\lumen-gerencial` (base `master`)
- HERMES: dentro do monorepo NEXUS (base `master`)

Rode (ajuste o repo e a base conforme o contexto):
```bash
git -C "<repo>" diff            # working tree não commitado
git -C "<repo>" diff --staged   # staged
git -C "<repo>" diff <base>...HEAD  # base por projeto: main no Portal, master no Gerencial/NEXUS/HERMES
```
Se o usuário indicou arquivos ou colou um diff, use isso. Se nada disso existir, peça o repo ou o diff e pare. Nunca rode comando git que altera estado (só leitura: `diff`, `log`, `show`).

## Passo 2 — Modo rápido (default, 2 a 3 min)

Sempre comece aqui. Verifique no diff:

1. **Secrets** — token, senha, chave de API, credencial hardcoded no código ou comentário.
2. **Auth** — o diff toca JWT, middleware de autenticação, ou `require_scope`/autorização? A proteção foi mantida ou enfraquecida?
3. **Rota desprotegida** — rota nova ou alterada sem autorização aplicada.
4. **Isolamento multi-tenant** *(quando aplicável)* — endpoint/query que acessa dados de múltiplos clientes sem filtro explícito por `org_id`/`tenant_id`.
5. **Migration destrutiva** — `DROP`, `DELETE` em massa, remoção de coluna com dados, NOT NULL sem default, `ALTER` sem rollback.
6. **Audit_log** — ação crítica que deixou de gerar log de auditoria.
7. **Regressão óbvia** — quebra de contrato esperado por testes ou código existente.

### Auto-escalação (não é escolha do usuário)

Se QUALQUER item 2, 4, 5 ou 6 disparar, OU houver hard-stop (lista abaixo), aprofunde automaticamente APENAS na área afetada usando o checklist do Passo 3. Não pergunte. Apenas aprofunde e diga no output que escalou.

## Passo 3 — Modo profundo (auto-escalado ou pedido explícito)

Use em gate de fase, promoção HML→produção, módulo novo, mudança em segurança ou integração externa.

**Auth/autz:** JWT (expiração, assinatura, claims, `kid` no header não no payload), service account/api_token (emissão, revogação, escopo), `require_scope` em toda rota que exige, lógica RBAC por perfil.

**Isolamento** *(multi-tenant)*: filtro `org_id`/`tenant_id` em todas as queries relevantes, IDOR, logs vazando dados de outra org.

**Código:** SQL injection (queries parametrizadas), validação de entrada no backend, path traversal e SSRF só se houver fetch/IO externo real.

**Auditabilidade:** ações críticas com `audit_log` suficiente, logs sem dados sensíveis, rastreabilidade em background tasks.

**Infra/deploy:** CORS sem wildcard em produção e por ambiente, security headers (CSP, X-Frame-Options/frame-ancestors, HSTS, X-Content-Type-Options), migrations Alembic reversíveis com rollback, secrets via env.

**Arquitetura:** mudança dentro do escopo, sem breaking change não documentada, testes cobrindo o alterado, risco operacional em produção mitigado.

## Passo 4 — Checklist de regressão ITS (o diferencial)

Estas são falhas reais já registradas na memória da ITS. Verifique sempre que o diff tocar a área. Esta lista deve crescer a cada nova lição aprendida.

- **write_audit_log com service account:** `user_id` deve ser `None` e o SA id vai em metadata (`caller_service_account_id`). SA id como `user_id` = violação de FK silenciosa.
- **Raw SQL em audit_log:** a coluna é `metadata`, não o atributo ORM `metadata_`. Não usar nome ORM em psql cru.
- **Alembic NOT NULL em tabela populada:** `DROP NOT NULL` antes do `UPDATE`, ou 3 passos (nullable → backfill → NOT NULL). Trocar FK de coluna NOT NULL também exige isso.
- **UPDATE em tabela particionada com unique constraint:** usar DELETE+INSERT em transação, não UPDATE (overlap viola a constraint).
- **Ordem de middleware Starlette:** `@app.middleware` prepende; o último definido roda primeiro. Middleware que depende de `request.state.X` deve vir DEPOIS do provedor no código. Validar por comportamento, não por grep.
- **JWT:** `kid` no header (RFC 7515), `jti`+`email` no payload.
- **FastAPI DELETE 204:** com `from __future__ import annotations`, exige `response_model=None` ou dá AssertionError.
- **Rotas de coleção (Gerencial):** trailing slash obrigatória.
- **Deploy Portal:** `alembic upgrade head` NÃO roda no post-receive. Se o PR adiciona migration, sinalizar que o upgrade é passo manual pós-push via `docker exec`.
- **Token lmn_ em Bash/SSH:** o auto-classifier bloqueia. Scripts de deploy/seed que ecoam token quebram; usar Write+SCP+Python remoto ou `docker exec -e VAR=token`.
- **lumen_core.tenants sem is_default:** usar oldest active (`ORDER BY created_at ASC LIMIT 1`).
- **Timezone:** datetime ingênuo é São Paulo, não UTC; importar como UTC desloca 3h.
- **aiomysql LIKE:** usar `%%X%%` para wildcards (`%` é placeholder).

## Passo 5 — Auditoria cruzada Codex (só quando sensível)

Dispara APENAS quando o Passo 2 auto-escalou OU o diff toca área sensível (produção, dados, DRE, auth, RBAC, migration, deploy, permissões, CI crítico). Diff trivial NÃO consulta Codex.

Rodar o Codex CLI em modo read-only sobre o mesmo diff, sem colar o diff no prompt (o Codex lê o repo):

```bash
codex exec --sandbox read-only "Audite o diff de <base>...HEAD no repo <path> como revisor independente. Não altere arquivos. Responda exatamente neste formato: 1) Achados no repositório; 2) Arquivos/funções relevantes; 3) Riscos; 4) Duplicidades detectadas (lógica equivalente já existente); 5) Melhor caminho recomendado; 6) Condições de bloqueio."
```

- Se `--sandbox read-only` não for aceito pela versão instalada, usar `codex exec` puro (default já é read-only). Se o Codex CLI não estiver disponível ou falhar, registrar `CODEX: indisponível` no output e seguir com a revisão própria; a falha do auditor não bloqueia o gate sozinha.
- Incorporar os achados do Codex aos ACHADOS (P0-P3) com a marca `[codex]`.
- Divergência entre esta revisão e o Codex em risco médio/alto: expor as duas posições no output, com recomendação consolidada e condição de bloqueio, e deixar a decisão com o Julio. Divergência em risco baixo: decidir e registrar em 1 linha.
- Codex NUNCA escreve. Um agente escreve por vez.

## Hard stops — classificar P0 e bloquear

- `DELETE`/`TRUNCATE` sem `WHERE` documentado
- Migration destrutiva sem rollback
- Alteração de RBAC, perfil ou escopo de usuário
- Alteração de `tenant_id`/`org_id` *(multi-tenant)*
- Rota sensível sem `require_scope`
- Query multi-tenant sem filtro de escopo *(multi-tenant)*
- Secret hardcoded
- Remoção/desativação de `audit_log` em ação crítica
- Bypass de autenticação ou autorização
- Push/deploy/infra sem autorização documentada (viola política HML-first)

## Regras

1. Não aplicar patch automaticamente.
2. Não propor redesign nem refatoração fora do escopo.
3. Não bloquear por estética, formatação ou preferência.
4. P0 exige evidência concreta no diff. Suspeita sem código = P2 ou P3, nunca bloqueio.
5. Sempre propor a correção mínima e o teste mínimo que a valida.
6. Caça genérica de bug não é desta skill: recomendar `/gsd-code-review` para isso.
7. Em conflito com o `CLAUDE.md` global ou de projeto, o `CLAUDE.md` prevalece.
8. Respeitar HML-first: nada vai para produção sem gate HML validado e GO explícito.

## Formato de saída

```
MODO: rápido | rápido + escalado em [área] | profundo
REPO/DIFF: [repo e base usados, ou origem do diff]
RESUMO DO DIFF: [o que mudou]
RISCO GERAL: baixo | médio | alto | crítico

ACHADOS:
P0 — bloqueante
  [achado] | Evidência: [arquivo:linha] | Impacto: [...] | Correção mínima: [...] | Teste: [...]
P1 — alto risco
  [achado] | Evidência: [...] | Correção mínima: [...]
P2 — médio
  [achado] | Recomendação: [...]
P3 — observação
  [achado]

RISCO DE REGRESSÃO: [ou "nenhum"]
RISCO DE SEGURANÇA: [ou "nenhum"]
RISCO OPERACIONAL: [ou "nenhum"]
CODEX: consultado (concorda | diverge em [ponto]) | não aplicável (diff trivial) | indisponível

DECISÃO: aprovado | aprovado com ressalvas | bloquear
HARD STOPS: [lista, ou "nenhum"]
PERGUNTAS PARA HUMANO: [lista, ou "nenhuma"]
```

## Destino futuro (não fazer agora)

O enforcement real é um git hook pre-push ou passo de CI que roda esta lógica sozinho, sem depender de invocação manual. A invocação manual não protege a fábrica noturna. Quando a skill estiver validada em uso real, promover os hard-stops para um hook.
