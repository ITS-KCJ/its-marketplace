---
description: Pré-flight read-only ANTES de qualquer apply de deploy. Lista bloqueadores conhecidos (branch errado, serviço que ficaria em imagem antiga, migração pendente, rollback ausente) e entrega laudo GO/NO-GO. Não faz deploy, não altera nada. Universal ITS (Portal, Gerencial, NEXUS, ITS-WI).
---

# ITS Preflight Deploy

Roda ANTES do apply e responde uma pergunta: **posso deployar agora, ou algo conhecido me impede?** Complementa o `/its-deploy-smoke`, que é o oposto (roda DEPOIS e valida que subiu são). Nunca confundir os dois: pré-flight decide se aperta o botão; smoke confere o que já subiu.

Esta skill é **só leitura**. Não faz deploy, não dá push, não roda migration, não builda, não reinicia serviço. Só observa e conclui.

## Como usar

`/its-preflight-deploy <projeto> <ambiente>`

Ex: `/its-preflight-deploy gerencial hml` · `/its-preflight-deploy portal prod`

Se faltar projeto ou ambiente, perguntar uma vez. **Default de ambiente é `hml`** (.96).

## Alvos e branch canônico (conferir contra a tabela de projetos do CLAUDE.md)

| Projeto | Branch de deploy | HML (.96) | Produção | Deploy canônico |
|---------|------------------|-----------|----------|-----------------|
| LUMEN Portal | `main` | `portal-homologacao-*` | .91 | `git push vm main` |
| LUMEN Gerencial | `master` | `gerencial-hml-*` | .92 | `git push vm master` |
| NEXUS | `master` | não tem HML: valida na própria .94 | .94 | SCP + docker build |
| ITS-WI | (não documentado) | não tem HML | .95 | não documentado |

Branch errado é o bloqueador mais comum e mais barato de pegar aqui. Se o branch ativo do repo não bate com o branch de deploy do projeto, é NO-GO imediato.

## Checklist de pré-flight (na ordem, tudo read-only)

1. **Branch ativo correto** — `git -C <repo> rev-parse --abbrev-ref HEAD` bate com o branch de deploy da tabela? Working tree limpo (`git status --porcelain`)? Está à frente/atrás do remoto de deploy (`git rev-list --left-right --count`)? Divergência ou branch errado = bloqueador.
2. **O que precisa rebuild** — listar os serviços do release: backend, frontend, worker. Para cada um, dizer se o apply planejado reconstrói a imagem. Sinalizar explicitamente qualquer serviço que **ficaria em imagem antiga** (ex.: worker não incluído no rebuild). Este é o segundo bloqueador mais comum: worker rodando código velho. Se a checagem exige a VM (imagem em execução) e a sessão está em LOCAL_ONLY, registrar `não verificável nesta sessão` — não presumir OK.
3. **Migrações pendentes** — listar as migrations que o release traz e ainda não estão aplicadas (`alembic heads` vs `alembic current`, ou o diff de arquivos em `alembic/versions`). Só LISTAR, nunca aplicar. **Atenção Portal:** `alembic upgrade head` não roda no post-receive; migration pendente aqui vira passo manual obrigatório no apply.
4. **Migração nunca via stdin** — se o plano de apply passa SQL/migration por stdin (pipe, heredoc, `psql < ...` inline), é bloqueador: exigir arquivo versionado. Migração via stdin não deixa rastro e já quebrou deploy antes.
5. **Backup/rollback documentado** — existe caminho de volta claro e citável? Tag/commit anterior, snapshot, dump pré-deploy. NEXUS (.94): dump/snapshot pré-deploy é regra permanente do CLAUDE.md, ausência = NO-GO. Sem rollback documentado = bloqueador.

## Hard stops (forçam NO-GO)

- Branch ativo diferente do branch de deploy do projeto.
- Working tree sujo (mudança não commitada) no repo que vai ser deployado.
- Serviço que ficaria em imagem antiga (worker/frontend/backend fora do rebuild).
- Migration pendente sem passo de aplicação previsto (especial Portal).
- Migração planejada via stdin em vez de arquivo.
- Rollback/backup não documentado (NEXUS: dump pré-deploy ausente).
- Qualquer item acima `não verificável` — fail-closed: não verificável conta como bloqueador, não como OK.

## Regras

- Só leitura. Nenhum comando muda estado. Se validar exige alterar algo, parar e reportar.
- Fail-closed: na dúvida, NO-GO. Item não verificável é bloqueador, não passe livre.
- NO-GO exige evidência concreta (saída de comando), não suspeita.
- Este pré-flight NÃO autoriza produção. Produção segue exigindo os 3 gates do CLAUDE.md + GO explícito do Julio. GO de pré-flight só diz "não há bloqueador conhecido para apertar o botão".
- Em conflito com o `CLAUDE.md`, o `CLAUDE.md` prevalece.

## Formato de saída

```
PROJETO/AMBIENTE: [ex: gerencial / hml (.96)]

PRÉ-FLIGHT:
  Branch:        OK (master, limpo, sincronizado) | BLOQUEIO — [esperado vs atual]
  Rebuild:       backend [rebuild|antiga|n/v]  frontend [...]  worker [...]
  Migrations:    nenhuma pendente | PENDENTE — [lista] | n/v
  Migração stdin: não | BLOQUEIO — usa stdin
  Rollback:      documentado — [qual] | AUSENTE

BLOQUEADORES: [lista numerada, ou "nenhum"]

VEREDITO: GO | NO-GO
PRÓXIMA AÇÃO: [uma frase — apply liberado / corrigir X antes do apply]
```

n/v = não verificável nesta sessão (ex.: LOCAL_ONLY sem acesso à VM). Conta como bloqueador.
