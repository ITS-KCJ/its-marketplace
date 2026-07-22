---
description: Ativa um modo de operação persistente para a sessão (LOCAL_ONLY, HML_OK) com enforcement determinístico por hook. Substitui o muro de proibições colado no prompt por 1 linha que sobrevive à compactação.
argument-hint: "LOCAL_ONLY|HML_OK [--repo <path>] [--extra nao-commit,nao-merge,...] | off | status"
---

# ITS Modo de Sessão

Grava `.claude/session-rules.json` que dois hooks consomem: `jb-session-mode.js` (PreToolUse, bloqueia ação fora do modo) e `jb-session-mode-banner.js` (UserPromptSubmit, reinjeta o modo a cada turno). Com modo ativo, o Julio NÃO precisa repetir proibições no prompt.

## Modos

| Modo | Bloqueia |
|------|----------|
| `LOCAL_ONLY` | git push (qualquer remote, inclusive backup), merge, migration, ssh/scp, qualquer IP 10.70.1.x, docker remoto, scripts de deploy |
| `HML_OK` | só sync ad-hoc em container remoto (ssh + docker cp / pip install, docker -H). Produção continua coberta pelo jb-its-prod-guard |
| `LAB_OK` | **Escopo do GO-B1 (provisionar a VM gw01).** Libera ssh + os IPs `10.70.1.3` (pve03) e `10.70.1.125` (gw01) e os verbos `qm create/set/start`. BLOQUEIA todo o resto de `10.70.1.x` (inclui `.96/.121/.122/.123` e qualquer VM existente), `qm destroy/stop/…` e mutação de VM existente, storage/cluster/bridge/firewall-global/backup/config do Proxmox (`pvesm/pvecm/pve-firewall/vzdump/pvesh set/…`), hosts Proxmox fora do pve03 (`pve1/pve2/pve4/pve5/pveaux/pbs`), Kamailio/`dispatcher.list`, push, deploy, migration, docker remoto. Ativar com validade CURTA; **reverter para LOCAL_ONLY ao fim do lote** (não há auto-revert: ao expirar o hook fica silencioso, então o rollback é explícito). |

`PROD_READONLY` e `PROD_GO` ainda não existem: dependem do refactor do jb-its-prod-guard (GO separado do Julio). Se pedidos, explicar isso e sugerir HML_OK.

## Tokens de `--extra` (aditivos a qualquer modo)

`nao-push`, `nao-commit`, `nao-merge`, `nao-migration`, `nao-ssh`, `nao-ip-rede`, `nao-docker-remoto`, `nao-deploy`

## Execução

1. **Determinar onde gravar o arquivo de regras:**
   - Se o cwd da sessão está dentro de um repo git: `<raiz do repo>/.claude/session-rules.json`. Acrescentar `.claude/session-rules.json` ao `<raiz>/.git/info/exclude` se ainda não estiver (nunca commitar esse arquivo).
   - Se o cwd é genérico (`C:\Users\<usuario>`, `C:\dev`, `C:\Windows\System32`): gravar em `~/.claude/session-rules.json` e AVISAR que o modo vale para todas as sessões abertas em diretório genérico até expirar ou até `/its-modo off`.
2. **Gravar o JSON:**
```json
{
  "modo": "LOCAL_ONLY",
  "repo_permitido": "C:\\dev\\projetos\\lumen-portal",
  "deny_extra": ["nao-commit"],
  "criado": "<agora ISO>",
  "valido_ate": "<agora + 12h ISO>"
}
```
   - `repo_permitido` só quando `--repo` for passado (ou quando o cwd já é um projeto de `C:\dev\projetos`, usar a raiz dele). Com ele setado, Edit/Write em OUTRO projeto de `C:\dev\projetos` é bloqueado.
   - Validade padrão 12h. `--horas N` ajusta.
   - **Campos do LAB_OK** (lidos pelo `jb-session-mode.js`; sempre com validade CURTA + `fallback_modo: "LOCAL_ONLY"`):
     - `ip_aprovado` — amplia a allowlist do `ipGuard` além do `10.70.1.3` (pve03, fixo). Aceita **string** (1 IP) ou **array** (N IPs). Sintaxe: `--extra ip_aprovado=10.70.1.126` → grava string; `--extra ip_aprovado=10.70.1.126,10.70.1.121` (CSV) → grava **array** `["10.70.1.126","10.70.1.121"]`. IP inválido / tipo inesperado / array vazio é ignorado (allowlist só amplia com IP válido). GO-C1B0 (2026-07-19).
     - `vmid_aprovado` — libera os verbos `qm` GATED (create/set/start/stop/shutdown/…) **apenas** para esse VMID; sem ele, todo `qm` mutante é bloqueado (só `qm list/status/config` passam). Ex.: `--extra vmid_aprovado=1308`.
   - Exemplo LAB_OK (dois IPs + VMID): `{"modo":"LAB_OK","ip_aprovado":["10.70.1.126","10.70.1.121"],"vmid_aprovado":1308,"fallback_modo":"LOCAL_ONLY","valido_ate":"<agora+1h>"}`.
3. **`/its-modo off`**: apagar o session-rules.json encontrado (procurar do cwd para cima; conferir também `~/.claude/session-rules.json`). Confirmar em 1 linha o que foi removido.
4. **`/its-modo status`**: mostrar arquivo encontrado, modo, extras, validade e se está expirado. Sem arquivo: "nenhum modo ativo".
5. **Confirmar em 1 linha** o que ficou ativo: modo, repo, extras, validade. Sem relatório.

## Regras

- Este comando NUNCA relaxa outro guard: é deny-only. Produção segue com jb-its-prod-guard + 3 gates + GO.
- Se o Julio colar um muro de proibições no prompt tendo modo ativo que já cobre, responder que o modo já cobre e seguir; se a proibição colada NÃO está coberta, sugerir o token `--extra` correspondente na hora (regra: restrição digitada 2x vira sistema).
