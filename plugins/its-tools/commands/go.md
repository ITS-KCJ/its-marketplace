---
description: Registra o GO explícito do Julio para um deploy de produção específico, checa os 3 gates da política HML-first e libera o marcador de bypass `# GO-PROD` só para aquele deploy.
argument-hint: "[projeto] [VM destino]"
---

# /go — Registro de GO de produção

Produção (.91/.92/.94/.95, `git push vm`, docker via SSH) é bloqueada por padrão pelo hook `jb-its-prod-guard`. O único bypass é o marcador `# GO-PROD` num comando Bash, e esse marcador só pode existir depois de um GO real e registrado, nunca improvisado no meio do chat.

Este comando é o único lugar que registra esse GO.

## Execução

1. **Confirmar com o Julio, na conversa, os 3 gates da política HML-first** (`CLAUDE.md`, seção "Política de deploy: HML primeiro"):
   1. Fase 100% completa (todos os planos executados);
   2. Gate da fase PASS, com validação em HML (.96) registrada em GATE-REPORT/SUMMARY da própria fase (ou smoke de `/its-deploy-smoke` como evidência);
   3. GO explícito do Julio para aquele deploy específico.
   Perguntar também, se ainda não estiver claro: repo, branch e commit curto que vai para produção, e a VM destino.

2. **Se qualquer gate 1 ou 2 não passou:** NÃO registrar GO. Explicar em 1 ou 2 frases o que falta (ex: fase incompleta, sem validação em HML) e encerrar sem tocar no log.

3. **Se o Julio disser não, hesitar ou pedir mais tempo:** não registrar nada, encerrar a conversa sobre o GO nesse ponto.

4. **Ao receber o GO explícito** (gates 1 e 2 já cumpridos, e o Julio confirma a palavra GO para aquele deploy): acrescentar uma linha em `~/.claude/GO-PROD-LOG.md`.
   - Se o arquivo não existir, criar com o cabeçalho:
     ```
     # Log de GO de produção

     Registro append-only de todo GO explícito do Julio para deploy em produção. Cada linha autoriza um único deploy, não a sessão inteira.

     | Data (ISO) | VM destino | Repo | Branch@commit | Escopo | GO |
     |---|---|---|---|---|---|
     ```
   - Acrescentar a linha nesse formato de tabela:
     `| <data e hora ISO> | <VM, ex: .91> | <repo> | <branch>@<commit curto> | <escopo em 1 frase> | GO |`

5. **Só depois da linha gravada**, informar ao Julio que o marcador `# GO-PROD` está liberado para os comandos daquele deploy específico, e lembrar explicitamente: o marcador vale só para aquele deploy (aquele repo, branch, commit e VM), não para a sessão inteira, não para outro deploy, mesmo que próximo no tempo.

## Regras

- Nunca registrar GO sem os gates 1 e 2 confirmados.
- Nunca inferir ou presumir um GO: só a palavra explícita do Julio, nessa conversa, conta.
- Não editar nem apagar linhas antigas do log: é append-only.
- Este comando não faz deploy, não dá push, não executa nada em VM: só confirma, registra e libera o marcador. Quem executa o deploy é o fluxo normal do projeto (ex: `git push vm main`), com `# GO-PROD` já no comando.
- Em caso de hotfix de incidente (exceção única da política): mesmo assim, registrar a linha no log antes de liberar o marcador, marcando o escopo como "hotfix de incidente".
