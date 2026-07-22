---
description: Smoke test pós-deploy e coleta de evidência para gate de produção. Valida que o deploy subiu são (healthcheck, containers, migrations, rotas críticas, versão) e entrega GO/NO-GO. Só leitura, não faz deploy nem altera nada. Universal ITS (NEXUS, Portal, Gerencial, ITS-WI).
---

# ITS Deploy Smoke

Verifica que um deploy subiu são e entrega um veredito GO/NO-GO com evidência. Dois usos:

1. **Em HML (.96), antes de promover:** é a coleta de evidência exigida pelo gate 2 da política HML-first (validação na homologação registrada). Sem isso, não há GO de produção.
2. **Pós-deploy em produção:** smoke imediato para confirmar que não quebrou nada.

Esta skill é **só leitura**. Não faz deploy, não dá push, não roda migration, não reinicia serviço, não altera produção. Só observa e conclui.

## Como usar

`/its-deploy-smoke <projeto> <ambiente>`

Ex: `/its-deploy-smoke nexus hml` · `/its-deploy-smoke portal prod`

Se faltar projeto ou ambiente, perguntar uma vez. **Default de ambiente é `hml`** (.96).

## Alvos conhecidos

| Projeto | HML (.96) | Produção | Deploy canônico |
|---------|-----------|----------|-----------------|
| NEXUS | não tem HML: validação na própria .94 (ver INFRA-FACTS) | .94 | SCP + docker build |
| LUMEN Portal | `portal-homologacao-*` | .91 | `git push vm main` |
| LUMEN Gerencial | `gerencial-hml-*` | .92 (branch master) | `git push vm master` |

> LUMEN Voice saiu da lista: é legado, substituído pelo Gerencial em gerencial.itscs.net. Não é mais alvo de deploy/smoke. ITS-WI (.95): fluxo de deploy ainda não documentado.

SSH: `bueno@10.70.1.96` (HML) ou a VM de produção correspondente. Só comandos de leitura: `docker ps`, `docker logs`, `docker exec ... <read-only>`, `curl healthcheck`, `git log`. Nunca comando que altera estado.

## Passo 0 — Anti-deploy-fantasma (obrigatório, antes de qualquer outro check)

Deploy declarado não é deploy verificado. Coletar TRÊS hashes e compará-los. **Regra: os 3 hashes iguais, ou o veredito é DEPLOY_FANTASMA (NO-GO imediato, não seguir para o checklist).**

1. **Hash local** — o commit que se declara deployado: `git -C <repo> rev-parse HEAD` (ou o hash explícito do release, se não for o HEAD atual).
2. **Hash no remoto de deploy** — o que a VM recebeu: `git ls-remote <remote> <branch>` (Portal: remote `vm`/`hml`, branch `main`; Gerencial: `master`; NEXUS: conferir o mecanismo, deploy é SCP + build).
3. **Hash em execução no container** — o que está rodando de fato, na ordem de tentativa:
   - endpoint de versão/health que exponha o commit (`curl`);
   - `docker exec <container> git rev-parse HEAD` (se a imagem carrega `.git`);
   - `docker inspect <container> --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'` (label OCI);
   - `docker exec <container> cat /app/VERSION` ou equivalente do projeto.

Hash que não dá para obter NÃO conta como igual: registrar `não verificável` e o resultado é DEPLOY_FANTASMA do mesmo jeito. A correção certa é dar observabilidade ao commit (expor no health/label), nunca presumir. Só o Julio pode aceitar seguir com hash não verificável, como ressalva explícita registrada no output.

Racional: `docker compose restart` não reaplica env nem imagem, rebuild pode ter falhado em silêncio, e código via `docker cp`/`pip install` cria drift invisível ao git (lições 64-12, 64-13).

## Checklist de smoke (na ordem)

1. **Containers** — `docker ps` na stack do projeto: todos `Up`/`healthy`, nenhum em restart loop. Anotar os que faltam ou reiniciam.
2. **Healthcheck** — `curl` no endpoint de health do serviço. Espera 200. Anotar status real.
3. **Versão/commit no ar** — já coberto pelo Passo 0 (3 hashes). Aqui só transcrever o resultado; se o Passo 0 não passou, este checklist nem roda.
4. **Migrations aplicadas** — `alembic current` via `docker exec` confirma que o schema está no head esperado. **Atenção Portal:** `alembic upgrade head` NÃO roda no post-receive; se o release tinha migration, confirmar que o passo manual foi feito (ver `lessons.md` do Portal).
5. **Rotas críticas** — `curl` em 2 a 4 rotas que provam o caminho principal do release. Auth respondendo (401 sem token, 200 com), rota nova do release respondendo, rota de leitura central OK.
6. **Logs** — `docker logs --tail` do serviço nos últimos minutos: sem stacktrace, sem erro de conexão a banco, sem `ImportError`/boot loop, sem erro de migration.
7. **Rollback conhecido** — confirmar que existe caminho de volta claro (tag/commit anterior, ou stack anterior). Se não houver, é ressalva forte.

## Hard stops (forçam NO-GO ou bloqueiam promoção)

- **DEPLOY_FANTASMA: os 3 hashes do Passo 0 não são iguais (ou algum é não verificável).**
- Container crítico fora do ar ou em restart loop.
- Healthcheck != 200.
- Migration não aplicada quando o release exige (especial Portal).
- Stacktrace recorrente no log pós-boot.
- Versão no ar diferente da esperada.
- **Promoção HML → produção sem os 3 gates do CLAUDE.md:** fase 100% completa, gate PASS com validação .96 registrada, e GO explícito do Julio. Smoke verde NÃO substitui o GO. Smoke é evidência para o gate 2, não autorização.

## Regras

- Só leitura. Nenhum comando muda estado. Se for preciso alterar algo para validar, parar e reportar, não executar.
- Não ecoar token `lmn_` em bash/SSH (o auto-classifier bloqueia; ver `lessons.md` NEXUS). Usar `docker exec -e VAR=token` se precisar.
- P0/NO-GO exige evidência concreta (saída de comando), não suspeita.
- Em conflito com `CLAUDE.md`, o `CLAUDE.md` prevalece. HML-first sempre.
- Ao terminar, se achar regressão nova e real, sugerir registrá-la no `lessons.md` do projeto.

## Formato de saída

```
PROJETO/AMBIENTE: [ex: nexus / hml (.96)]

PASSO 0 (anti-deploy-fantasma):
  Hash local:     [hash]
  Hash remoto:    [hash]
  Hash container: [hash | não verificável — como tentou]
  Resultado:      IGUAIS | DEPLOY_FANTASMA

SMOKE:
  Containers:    OK | FALHA — [evidência]
  Healthcheck:   OK (200) | FALHA — [status]
  Versão/commit: OK | DIVERGE — [esperado vs no ar]
  Migrations:    OK (head) | PENDENTE — [evidência]
  Rotas críticas:OK | FALHA — [rota e status]
  Logs:          limpos | ERRO — [trecho]
  Rollback:      conhecido | ausente

RISCO: baixo | médio | alto | crítico
HARD STOPS: [lista, ou "nenhum"]

VEREDITO: GO | GO com ressalvas | NO-GO
  (em HML: "evidência suficiente para gate 2" | "não suficiente")
PRÓXIMA AÇÃO: [uma frase — promover com GO do Julio / corrigir X / rollback]
```

## Destino futuro (não fazer agora)

Promover este checklist para um passo de CI/pós-deploy que roda sozinho na .96 e publica o veredito, em vez de depender de invocação manual. Fazer só depois de validado em uso real.
