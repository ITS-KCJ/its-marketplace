#!/usr/bin/env node
// jb-its-prod-guard.js — PreToolUse(Bash|PowerShell). Guard de producao + segredos ITS.
//
// Bloqueia execucao AUTONOMA do agente em comandos que (a) tocam PRODUCAO sem GO explicito
// ou (b) expoem SEGREDO em texto claro (senha, token, secret, key).
// HML (.96) NUNCA e bloqueado. 10.70.1.95 (ITS-WI) tambem liberada (nao e producao, sem HML) — ver INFRA-FACTS.md.
// Bypass auditavel de producao: marcador GO-PROD no comando.
// Bypass auditavel de segredo:  marcador SEGREDO-OK no comando (libera SO a checagem de segredo, nao a de producao).
// O proprio Julio sempre pode rodar manualmente via prefixo ! (nao passa por este hook).
//
// Filosofia: parsing falha ABERTO (erro de leitura/JSON -> nao bloqueia, nao trava o fluxo).
//            deteccao de segredo falha FECHADO (padrao suspeito -> bloqueia; na duvida, barra).
// Para desligar: remover este hook do bloco PreToolUse em settings.json.
'use strict';

let raw = '';
try { raw = require('fs').readFileSync(0, 'utf8'); } catch (_) { process.exit(0); }

let cmd = '';
try {
  const j = JSON.parse(raw || '{}');
  cmd = (j && j.tool_input && j.tool_input.command) ? String(j.tool_input.command) : '';
} catch (_) { process.exit(0); }
if (!cmd) process.exit(0);

// Bypass explicito de producao (GO real do Julio). Marcador deixa rastro no comando.
if (/GO-PROD/.test(cmd)) process.exit(0);

const lc = cmd.toLowerCase();
const reasons = [];

// ===== Guard de producao (politica HML-first) =====
// VMs de producao (NAO inclui 10.70.1.96 = HML)
// 10.70.1.95 (ITS-WI) removida da lista em 2026-07-07: nao esta em producao e nao tem HML,
// acesso livre ate o Julio validar mudanca dessa politica (ver INFRA-FACTS.md).
// 10.70.1.94 (NEXUS) removida em 2026-07-09 com aprovacao explicita do Julio ("edite o guard"):
// modo aceleracao governada, NEXUS sai do HML-first. Condicao do consenso Claude+Codex cumprida
// (backup PBS noturno da .94 confirmado por log, VM 1221 NEXUS-IP94). Regra permanente no
// CLAUDE.md: todo deploy na .94 exige dump/snapshot pre-deploy como rollback primario.
const prodIps = ['10.70.1.91', '10.70.1.92'];
const hitIp = prodIps.find((ip) => cmd.includes(ip));
if (hitIp) reasons.push('toca VM de producao ' + hitIp);

// git push para o remote de deploy de producao (Portal main / Gerencial master)
if (/git\s+push\s+vm(\s|$)/.test(lc)) reasons.push('git push vm (deploy de producao)');

// push forcado em qualquer lugar
if (/git\s+push\b[^\n]*(--force-with-lease|--force|\s-f\b)/.test(lc)) reasons.push('git push forcado');

// SQL destrutivo
if (/\btruncate\b/.test(lc)) reasons.push('TRUNCATE');
if (/\bdrop\s+(table|database|schema)\b/.test(lc)) reasons.push('DROP destrutivo');
if (/\bdelete\s+from\b/.test(lc) && !/\bwhere\b/.test(lc)) reasons.push('DELETE sem WHERE');

// ===== Guard de segredos (item 1, 2026-07-18) — FAIL-CLOSED =====
// Bloqueia comandos que expoem segredo em texto claro. Motivacao: 2 vazamentos reais de
// POSTGRES_PASSWORD em uma semana (via sed/regex sobre config e via printenv/echo).
// Bypass: marcador SEGREDO-OK no comando (comando legitimo que precisa citar esses nomes).
const secretReasons = /SEGREDO-OK/.test(cmd) ? [] : secretExposure(cmd, lc);

function secretExposure(cmd, lc) {
  const out = [];
  // Substrings de nome sensivel (nomes reais de env: DB_PASSWORD, SECRET_KEY, API_TOKEN...).
  // 'key' entra so como api[_-]key / private[_-]key / access[_-]key / *_key / signing[_-]key
  // para nao casar palavras comuns (MONKEY, KEYWORD). $KEY isolado nao e coberto (limite conhecido).
  const SENS = '(password|passwd|secret|token|credential|api[_-]?key|apikey|private[_-]?key|access[_-]?key|signing[_-]?key|[a-z0-9]_key|[a-z0-9]_pwd|_pwd\\b)';
  // Leitores de conteudo de arquivo.
  const READERS = 'cat|bat|sed|awk|grep|egrep|fgrep|rg|ack|head|tail|less|more|strings|xxd|od|type|gc|get-content';

  // (1) Leitura de arquivo .env (qualquer sufixo). Nao pega [ -f .env ], ls .env, test -f .env.
  if (new RegExp('\\b(' + READERS + ')\\b[^|;&\\n]*\\.env(\\.[a-z0-9_.-]+)?(\\s|$|["\'|;&)])', 'i').test(cmd))
    out.push('leitura de arquivo .env (pode expor segredo)');

  // (2) Reader cujo PADRAO de busca casa nome sensivel (ex.: sed/grep sobre config, compose, settings).
  if (new RegExp('\\b(' + READERS + ')\\b', 'i').test(cmd) && new RegExp(SENS, 'i').test(cmd)
      && !new RegExp('\\.env', 'i').test(cmd)) // ja coberto por (1); evita razao duplicada
    out.push('busca/extracao de segredo em arquivo (padrao sensivel)');

  // (3) Impressao de variavel sensivel em texto claro. $NAME, ${NAME}, $env:NAME, %NAME%.
  const PRINTERS = 'echo|printf|print|write-host|write-output';
  const varSensivel = new RegExp('(\\$\\{?|%|\\$env:)[a-z0-9_]*' + SENS, 'i');
  if (new RegExp('\\b(' + PRINTERS + ')\\b', 'i').test(cmd) && varSensivel.test(cmd))
    out.push('impressao de variavel sensivel em texto claro');

  // (4) printenv: sem argumento (dump total) ou de variavel sensivel.
  if (/(^|[;|&])\s*printenv\s*($|[|;&><])/.test(lc)) out.push('printenv sem filtro (dump do ambiente)');
  if (new RegExp('\\bprintenv\\s+[a-z0-9_]*' + SENS, 'i').test(cmd)) out.push('printenv de variavel sensivel');

  // (5) Dump do ambiente inteiro. env / set sozinhos ou por pipe. 'env VAR=x cmd' tem '=' -> permitido.
  if (/(^|[;|&])\s*env\s*($|\|)/.test(lc)) out.push('env sem filtro (dump do ambiente)');
  if (/(^|[;|&])\s*set\s*($|\|)/.test(lc)) out.push('set sem filtro (dump do ambiente)');

  // (6) PowerShell: dump do drive Env:.
  if (/\b(get-childitem|gci|ls|dir|childitem)\s+env:/i.test(cmd)) out.push('dump do drive Env: (PowerShell)');

  return out;
}

// ===== Decisao =====
if (reasons.length === 0 && secretReasons.length === 0) process.exit(0);

const blocks = [];
if (reasons.length) {
  blocks.push([
    'BLOQUEADO pelo guard ITS (politica HML-first).',
    'Motivo: ' + reasons.join('; ') + '.',
    '',
    'Producao exige os 3 gates do CLAUDE.md: fase 100% completa, gate PASS com validacao .96 registrada, e GO explicito do Julio. Este guard impede so a execucao AUTONOMA do agente; nao substitui o GO.',
    '',
    'Para liberar quando houver GO real: acrescentar o marcador  # GO-PROD  ao comando. Ou o Julio roda manualmente via prefixo ! na sessao.'
  ].join('\n'));
}
if (secretReasons.length) {
  blocks.push([
    'BLOQUEADO pelo guard ITS (exposicao de segredo).',
    'Motivo: ' + secretReasons.join('; ') + '.',
    '',
    'Comandos que despejam ou imprimem senha/token/secret/key em texto claro sao barrados (ja houve rotacao forcada por vazamento). Use verificacao segura de presenca (test -n "$VAR", [ -f .env ]), nunca imprima o valor.',
    '',
    'Se o comando for legitimo e precisar citar esses nomes: acrescentar o marcador  # SEGREDO-OK  ao comando (libera so esta checagem). Ou o Julio roda manualmente via prefixo ! na sessao.'
  ].join('\n'));
}

process.stderr.write(blocks.join('\n\n') + '\n');
process.exit(2);
