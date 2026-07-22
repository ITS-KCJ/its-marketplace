---
description: Premortem rápido para decisão go/no-go antes de fase, deploy, migration, automação ou mudança de processo. Saída curta e acionável, não acadêmica. Universal (NEXUS, LUMEN, HERMES, DRE, WFM, infra, processos).
---

# ITS Premortem

Antecipa falhas antes de começar algo relevante e entrega uma decisão go/no-go. Não é ensaio teórico. Saída curta, prática, acionável.

Use antes de: fase nova, deploy, migration, mudança em auth/RBAC/tenant, automação com impacto operacional, mudança de processo, integração externa, decisão financeira (DRE) ou de WFM.

## Como usar

`/its-premortem` seguido do que vai ser feito.

## Clarificação mínima antes da análise

Verificar se o contexto mínimo está presente:
- O que será feito
- Objetivo da mudança
- Sistema ou projeto afetado
- Se toca produção, dados, segurança, deploy, infraestrutura ou migration

Se o contexto for suficiente e nenhum hard stop for evidente, seguir direto sem perguntar.

Se faltar informação essencial, fazer no máximo 3 perguntas objetivas em uma única rodada, escolhendo entre:
1. Qual é o objetivo concreto da mudança?
2. Qual sistema ou projeto será afetado?
3. Isso toca produção, dados, segurança, deploy, infraestrutura ou migration?

Não perguntar sobre detalhe secundário. Se o usuário responder parcialmente, continuar o premortem com as informações disponíveis como premissas explícitas, registradas em MITIGAÇÃO MÍNIMA ou HARD STOPS. Não solicitar nova rodada de esclarecimento, salvo se o risco for alto ou a ação for irreversível.

## Método

Imagine que isso fracassou daqui a 1 a 3 meses. Trabalhe de trás para frente: o que provavelmente deu errado. Foque só em riscos **acionáveis** e prováveis para este caso concreto. Ignore risco genérico de manual.

Limites de tamanho:
- No máximo 5 riscos. Os mais prováveis e de maior impacto.
- No máximo 3 sinais antecipados.
- Mitigação e ações: só o mínimo que muda a decisão. Sem plano de 30 dias.

## Hard stops

Se o que vai ser feito envolve produção, dados, segurança, deploy, infraestrutura ou migration, marcar como hard stop: a decisão padrão é **seguir com ressalvas** ou **não seguir** até haver aprovação humana explícita e, quando aplicável, validação em HML (política HML-first do CLAUDE.md). Premortem não autoriza execução destrutiva nem deploy.

## Regras

- Não sugerir ação destrutiva.
- Respeitar o `CLAUDE.md` global; em conflito, o `CLAUDE.md` prevalece.
- Ser direto e crítico. Não agradar. Se a ideia é arriscada demais, dizer "não seguir".
- Se o risco for baixo e nada disparar hard stop, dizer "seguir" sem inventar ressalva.

## Formato de saída

```
DECISÃO: seguir | seguir com ressalvas | não seguir

PRINCIPAIS RISCOS (até 5):
- [risco] — [por que é provável aqui]

SINAIS ANTECIPADOS (até 3):
- [o que vai aparecer cedo se estiver dando errado]

MITIGAÇÃO MÍNIMA:
- [só o que reduz risco de verdade]

ANTES DE COMEÇAR:
- [ações concretas antes da primeira linha de código/comando]

HARD STOPS:
- [lista, ou "nenhum"]

PRÓXIMA AÇÃO RECOMENDADA:
- [uma frase: o passo concreto seguinte]
```
