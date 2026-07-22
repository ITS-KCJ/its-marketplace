---
description: Roda a bateria completa de validação de um projeto ITS (lint, type-check, testes, build e smoke de UI via browser) e entrega um pacote de evidência verde/vermelho. O Julio só faz o teste visual final. Não toca produção.
---

# ITS Validar

Valida uma mudança de ponta a ponta antes de entregar ao Julio. Roda o máximo de teste automatizado possível, incluindo UI, e só devolve para o humano quando tudo está verde, com evidência. O Julio faz apenas o teste visual final e o GO.

Esta skill NÃO faz deploy de produção e não dá `git push vm`. Pode subir a app local ou em HML (.96) para testar.

## Como usar

`/its-validar <projeto> [escopo]`

Ex: `/its-validar gerencial` · `/its-validar portal frontend`

Se o projeto não for dado, inferir pelo diretório atual ou pelo diff aberto.

## Passo 1: detectar stack e escopo

- Repo e raiz (base `C:\dev\projetos\`). Ver `git status` e `git diff` para saber o que mudou.
- Backend Python: `pyproject.toml`/requirements, `.venv`, `pytest`, `ruff`, `alembic`.
- Frontend: `package.json` com scripts `lint`, `type-check`/`tsc`, `test`, `build`.
- Decidir o que rodar pelo que o diff toca (backend, frontend ou ambos). Não rodar UI se nada de frontend mudou.

## Passo 2: bateria automatizada (na ordem; parar e corrigir no primeiro vermelho)

1. **Lint**: `ruff check` (backend) e `eslint` ou `npm run lint` (frontend).
2. **Type-check**: `tsc --noEmit` (frontend); `mypy` se configurado (backend).
3. **Testes**: `pytest -x -q` (backend); `vitest run` ou `npm test` (frontend). Se o que mudou não tem teste, escrever o teste mínimo que cobre a mudança (apoiar em `/gsd-add-tests`).
4. **Build**: `npm run build` (frontend) e/ou `docker compose build` quando o release exige.

Qualquer vermelho: corrigir a causa, não o sintoma, e repetir a bateria. Não seguir com etapa vermelha.

## Passo 3: smoke de UI (só se mexeu no frontend)

1. Subir a app: local (`docker compose up -d` ou `npm run dev`) ou usar HML (.96) se já estiver no ar.
2. Dirigir o browser com claude-in-chrome pelos fluxos afetados pelo diff: abrir as telas, logar, clicar, preencher e submeter os formulários alterados.
3. Capturar **screenshot de cada tela/estado** relevante (antes e depois da ação).
4. **Console**: `read_console_messages` filtrando erro/warning. Erro de JS é vermelho.
5. **Network**: `read_network_requests`, procurar 4xx/5xx nas chamadas dos fluxos testados.
6. Conferir o óbvio de UX: layout não quebrado, estados de loading/erro/vazio, responsivo quando aplicável, tokens do design system corretos.

Para auditoria visual mais profunda (6 pilares), encadear `/gsd-ui-review`.

## Passo 4: pacote de evidência

Montar o resumo abaixo. Só marcar PRONTO PARA VISUAL se tudo estiver verde.

## Regras

- Não tocar produção. Sem `git push vm`. HML-first.
- Não declarar verde sem a saída real do comando (não presumir).
- Vermelho que não consegue corrigir em tempo razoável: parar, mostrar a evidência e perguntar.
- Não pedir ao Julio para olhar nada antes de tudo o que é automatizável estar verde.

## Formato de saída

```
PROJETO/ESCOPO: [ex: gerencial / frontend]
DIFF: [o que mudou, 1 a 2 linhas]

AUTOMATIZADO:
  Lint:        OK | FALHA: [evidência]
  Type-check:  OK | FALHA: [evidência] | n/a
  Testes:      OK (n passed) | FALHA: [evidência] | sem teste, criado
  Build:       OK | FALHA: [evidência] | n/a

UI SMOKE: [n/a se não mexeu frontend]
  Telas:       [telas testadas]
  Screenshots: [caminhos dos arquivos]
  Console:     limpo | ERRO: [trecho]
  Network:     OK | 4xx/5xx: [rota e status]
  UX óbvio:    OK | problema: [o quê]

VEREDITO: PRONTO PARA VISUAL | AINDA VERMELHO: [o que falta]
PARA O JULIO: [o que olhar no teste visual final: telas/fluxos específicos]
```
