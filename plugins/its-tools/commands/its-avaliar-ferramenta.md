---
description: Filtro de decisão para ferramenta, repositório, skill, MCP ou prompt novo. Decide adotar agora, testar em laboratório, guardar para depois ou descartar. Antídoto contra dispersão. Saída curta e acionável, não ensaio.
---

# ITS Avaliar Ferramenta

Filtra qualquer coisa nova que apareça (repo, gist, skill, MCP, ferramenta SaaS, prompt, framework) e entrega uma decisão objetiva. Existe para evitar o erro real: instalar/estudar dezenas de coisas genéricas e dispersar. O default é cético. O ônus de prova é da ferramenta, não do setup atual.

Use quando: chegou um repo no feed, alguém mandou uma skill, surgiu um MCP novo, uma ferramenta SaaS promete resolver algo, ou você está em dúvida se algo merece entrar no fluxo.

## Como usar

`/its-avaliar-ferramenta` seguido do nome, link ou descrição do que avaliar. Cole o README, o print ou a descrição se tiver.

## Contexto fixo da ITS (não perguntar, assumir)

- ITS Customer Service, direção de TI/Segurança.
- Projetos: NEXUS, LUMEN (Portal, Gerencial), HERMES, DRE, WFM. (Voice: legado, descontinuado.)
- Stack: PostgreSQL, FastAPI, SQLAlchemy async, Alembic, JWT, RBAC, audit_log, isolamento por tenant, Docker.
- Política HML-first: produção bloqueada por padrão, só com gate validado e GO explícito.
- Setup já maduro: Claude Code + commands ITS + GSD + RTK + Obsidian/CORTEX CORE. O problema NÃO é falta de ferramenta, é excesso e dispersão.

Só perguntar (no máximo 2 perguntas, uma rodada) se faltar o essencial: o que a ferramenta faz, ou onde você pretende usá-la. Se a descrição já responde, seguir direto.

## Método

Avaliar de trás para frente: assumir que adotar foi um erro daqui a 3 meses, e ver se a ferramenta sobrevive a isso. Cético por padrão.

Critérios de corte, em ordem:

1. **Resolve um problema que você tem hoje?** Se é solução à procura de problema, descartar ou guardar.
2. **Já está coberto pelo setup atual?** GSD, commands ITS, RTK, Obsidian, financial-analyst, graphify, humanizer já cobrem muita coisa. Sobreposição = descartar, salvo ganho claro.
3. **Risco de segurança/LGPD.** Toca dados sensíveis, secrets, produção, SSH, deploy, push, migration? Se sim, nunca adoção direta: laboratório isolado, no máximo.
4. **Custo de manutenção e dispersão.** Mais um item no menu é custo de contexto. Vale o ruído?
5. **Reversibilidade.** Dá pra remover limpo se não prestar? Irreversível pesa contra.

## Regras

- Default é **descartar** ou **guardar para depois**. Adoção exige justificativa concreta.
- Não recomendar instalar pacote inteiro (awesome-*, índices de 75 repos). Ler, extrair o padrão bom, transformar em command ITS próprio.
- Qualquer coisa que toque produção, secrets, SSH, deploy, push ou migration: no máximo `testar em laboratório`, nunca `adotar agora`.
- Ser direto e crítico. Não agradar. Se for hype sem aplicação real na ITS, dizer "descartar".
- Em conflito com `CLAUDE.md`, o `CLAUDE.md` prevalece.

## Formato de saída

```
ITEM: [nome]
O QUE FAZ: [uma frase]
RESOLVE DE VERDADE: [o problema real, ou "nenhum claro"]

APLICA NA ITS: [onde, projeto/fluxo concreto, ou "não se aplica"]
NÃO APLICA: [onde não usar]
JÁ COBERTO POR: [item do setup atual que já faz isso, ou "nada"]

RISCO SEGURANÇA/LGPD: [baixo | médio | alto] — [por quê]
RISCO DISPERSÃO/MANUTENÇÃO: [baixo | médio | alto]
REVERSÍVEL: [sim | não]

VIRA COMMAND/SKILL PRÓPRIA: [sim | não] — [por quê]
ENTRA NO CLAUDE.md: [sim | não]

DECISÃO: adotar agora | testar em laboratório | guardar para depois | descartar
PRIMEIRO TESTE SEGURO: [se adotar ou testar: o passo mínimo e isolado]
PRÓXIMA AÇÃO: [uma frase]
```
