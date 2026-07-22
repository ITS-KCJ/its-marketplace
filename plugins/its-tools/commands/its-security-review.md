---
description: Auditoria profunda de segurança ITS, sob demanda, para módulos, rotas, serviços, migrations, integrações ou fluxos sensíveis. Não é gate de diff. Foco em risco real ITS, não OWASP genérico. Não aplica patch.
---

# ITS Security Review

Revisão profunda de segurança, sob demanda, de um alvo específico: módulo, conjunto de rotas, serviço, migration, integração ou fluxo sensível.

Não confundir com `/its-pre-merge-review`: aquele é gate rápido de diff em todo merge. Este é auditoria profunda, usado só quando o alvo toca auth, RBAC, tenant, service account, api_token, audit_log, migration, dados sensíveis, integração externa, exposição web ou produção. Não usar em diff pequeno.

## Como usar

`/its-security-review` seguido do alvo (caminho do módulo, rota, arquivo, fluxo ou descrição). Ler o código real com Read/Grep/Glob; não trabalhar de memória. Para histórico, usar `git -C <repo> show/log`. Repo canônico em `C:\dev\projetos\`, nunca a cópia antiga do OneDrive.

Caça genérica de bug e qualidade não é desta revisão: delegar a `/gsd-code-review`. Aqui o foco é segurança e risco real ITS.

## Escopo

1. Autenticação JWT Bearer (expiração, assinatura, claims, `kid` no header)
2. Service account / api_token (emissão, revogação, escopo, armazenamento de hash)
3. `require_scope` em toda rota que exige
4. RBAC (lógica de permissão por perfil)
5. Isolamento por `org_id`/`tenant_id`
6. IDOR (acesso a recurso de outro usuário/cliente sem validação)
7. audit_log (ações críticas registradas, sem dado sensível)
8. Secrets (nada hardcoded; via env)
9. Logs sensíveis (sem token, senha, JWT, api key, PII)
10. Validação de entrada no backend
11. Queries SQLAlchemy sem filtro de escopo
12. Alembic migrations (reversibilidade, rollback, precondições de dados)
13. CORS (sem wildcard em produção, por ambiente)
14. Security headers (CSP, frame-ancestors/X-Frame-Options, HSTS, X-Content-Type-Options)
15. Exposição de endpoints (o que está público que não deveria)
16. Permissões administrativas
17. Regressões ITS conhecidas (abaixo)

## Regressões ITS obrigatórias (verificar sempre que o alvo tocar a área)

- **write_audit_log com service account:** `user_id` deve ser `None`; SA id em metadata (`caller_service_account_id`). `audit_log.user_id` é FK para `users`, não `service_accounts`. SA id como user_id = violação de FK silenciosa.
- **Raw SQL em audit_log:** coluna é `metadata`, atributo ORM é `metadata_`. Não usar nome ORM em psql cru.
- **Alembic:** `DROP NOT NULL` antes do `UPDATE`; NOT NULL sem default em tabela populada falha. Trocar FK de coluna NOT NULL exige o mesmo cuidado.
- **UPDATE em tabela particionada com unique constraint:** usar DELETE+INSERT em transação.
- **Ordem de middleware Starlette:** `@app.middleware` prepende; o último definido roda primeiro. Middleware que depende de `request.state.X` deve vir DEPOIS do provedor no código. Validar por comportamento.
- **JWT:** `kid` no header (RFC 7515), não no payload.
- **FastAPI DELETE 204:** com `from __future__ import annotations`, exige `response_model=None`.
- **Token lmn_ em Bash/SSH:** auto-classifier bloqueia; scripts que ecoam token quebram. Usar Write+SCP+Python remoto ou `docker exec -e`.
- **Timezone:** datetime ingênuo é São Paulo, não UTC.
- **Repo canônico:** `C:\dev\projetos\`, não a cópia antiga do OneDrive.

## Hard stops — classificar P0 e bloquear

- Rota sensível sem `require_scope`
- Query multi-tenant sem filtro por `org_id`/`tenant_id`
- Bypass de autenticação ou RBAC
- Secret hardcoded
- Migration destrutiva sem rollback
- Remoção ou desativação de audit_log em ação crítica
- Log contendo token, senha, JWT, api key ou dado sensível
- Alteração de produção/deploy/infra sem autorização explícita (viola HML-first)

## Regras

- Não aplicar patch automaticamente.
- Não propor redesign nem refatoração oportunista.
- Propor sempre o patch mínimo.
- P0 exige evidência concreta no código.
- Sem evidência suficiente, marcar o item como **inconclusivo**, não como achado nem como aprovação.
- Não usar como OWASP genérico: foco em risco real ITS.
- Respeitar o `CLAUDE.md` global; em conflito, o `CLAUDE.md` prevalece.
- Respeitar HML-first: nada vai para produção sem gate HML validado e GO explícito.

## Formato de saída

```
ALVO: [o que foi analisado]
ESCOPO ENTENDIDO: [o que a revisão cobriu e o que ficou de fora]
RISCO GERAL: baixo | médio | alto | crítico

ACHADOS:
P0 — bloqueante
  [achado] | Evidência: [arquivo:linha] | Impacto explorável/operacional: [...] | Correção mínima: [...] | Teste: [...] | Falso positivo possível: [sim/não, por quê]
P1 — alto risco
  [idem]
P2 — médio
  [idem]
P3 — observação
  [idem]
INCONCLUSIVO
  [item sem evidência suficiente] | O que falta para concluir: [...]

DECISÃO: aprovado | aprovado com ressalvas | bloquear
HARD STOPS: [lista, ou "nenhum"]
PERGUNTAS PARA HUMANO: [lista, ou "nenhuma"]
```
