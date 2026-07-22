# Marketplace interno ITS — Claude Code

Marketplace de plugins da ITS para o Claude Code. Distribui o ferramental de
governança usado pelo time: guards determinísticos de produção e segredos,
commands de revisão/deploy e o instalador do RTK (economia de tokens).

## Instalação (cada membro do time)

Pré-requisitos: Claude Code logado na conta Teams da ITS, Node.js no PATH,
acesso de leitura a este repositório no GitHub.

```
/plugin marketplace add ITS-KCJ/its-marketplace
/plugin install its-tools@its
```

Se a org já distribui `extraKnownMarketplaces`/`enabledPlugins` via
Configurações gerenciadas, o marketplace aparece pré-registrado e basta o
`/plugin install`.

## O que o plugin `its-tools` entrega

### Commands
| Command | Uso |
|---|---|
| `/its-premortem` | Go/no-go antes de fase, deploy, migration ou automação |
| `/its-pre-merge-review` | Gate de revisão antes de merge/promoção |
| `/its-security-review` | Auditoria de segurança de módulo/rota/fluxo sensível |
| `/its-preflight-deploy` | Laudo GO/NO-GO read-only antes de apply de deploy |
| `/its-deploy-smoke` | Smoke test pós-deploy com evidência |
| `/its-validar` | Bateria completa de validação (lint, types, testes, build, UI) |
| `/its-avaliar-ferramenta` | Filtro de adoção de ferramenta/skill/MCP novo |
| `/its-modo` | Modo de sessão com enforcement por hook (LOCAL_ONLY, HML_OK) |
| `/go` | Registro auditável de GO de produção |

### Hooks (automáticos ao habilitar o plugin)
- **jb-its-prod-guard** — bloqueia comando autônomo que toque produção
  (IPs .91/.92/.94, `git push vm`, force push, SQL destrutivo) e vazamento de
  segredo em texto claro (leitura de `.env`, echo de variável sensível).
  Bypass auditável: `# GO-PROD` / `# SEGREDO-OK` ou comando manual via `!`.
- **jb-commit-body-guard** — commit `feat|fix|refactor|perf` sem corpo (o
  porquê) é bloqueado. Bypass: `# CORPO-DISPENSADO`.
- **jb-session-mode + banner** — enforcement do `/its-modo`, reinjetado a cada
  turno (sobrevive à compactação).
- **jb-its-prompt-router** — lembrete automático do fluxo ITS quando o prompt
  cita deploy, migration, merge, auth etc.
- **jb-handoff-auto** — gera `.planning/HANDOFF-AUTO.md` em PreCompact e
  SessionEnd; avisa na abertura se há handoff recente.

### RTK (economia de tokens, opcional)
```powershell
powershell -ExecutionPolicy Bypass -File <plugin>/scripts/install-rtk.ps1
```
O caminho do plugin instalado aparece em `/plugin` → its-tools. O RTK reduz
60–90% da saída de comandos de dev. A interceptação automática é opt-in por
projeto (instruções no fim do instalador). Onde a evidência exige saída bruta,
usar `rtk proxy <cmd>`.

## Aviso para quem já tem os hooks no settings.json pessoal

Quem já roda os hooks `jb-*` via `~/.claude/settings.json` (hoje: Julio) NÃO
deve habilitar o plugin — ou deve remover os blocos duplicados do settings
antes, senão cada guard roda duas vezes por comando.

## Atualização

Editar/adicionar conteúdo em `plugins/its-tools/`, commitar e dar push.
Nos clientes: `/plugin marketplace update its` (ou reinstalar o plugin).
Versionar mudanças relevantes em `plugin.json` (campo `version`).
