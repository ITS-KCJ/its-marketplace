#!/usr/bin/env node
// jb-commit-body-guard.js — PreToolUse(Bash). Rastro de decisao em commits (CLAUDE.md).
//
// Commits nao triviais (feat, fix, refactor, perf) devem ter CORPO explicando o
// motivo da mudanca e a alternativa descartada. Tipos triviais (docs, chore, test,
// style, build, ci) passam sem corpo. Trailer Co-Authored-By nao conta como corpo.
//
// Complementa o gsd-validate-commit.sh (que valida so o formato do assunto e e
// sobrescrito pelo /gsd-update). Este e jb-*: sobrevive a updates e sincroniza
// entre perfis via sync-perfis.ps1.
//
// Filosofia: falha ABERTO. Nao conseguiu extrair a mensagem -> nao bloqueia.
// Bypass auditavel para excecao legitima: incluir  # CORPO-DISPENSADO  no comando.
'use strict';

let raw = '';
try { raw = require('fs').readFileSync(0, 'utf8'); } catch (_) { process.exit(0); }

let cmd = '';
try {
  const j = JSON.parse(raw || '{}');
  cmd = (j && j.tool_input && j.tool_input.command) ? String(j.tool_input.command) : '';
} catch (_) { process.exit(0); }
if (!cmd) process.exit(0);

// So interessa git commit com -m
if (!/git\b[^\n|;&]*\bcommit\b/.test(cmd) || !/\s-m\s/.test(cmd)) process.exit(0);

// Bypass explicito (deixa rastro no comando)
if (/CORPO-DISPENSADO/.test(cmd)) process.exit(0);

// Extrai a mensagem: heredoc $(cat <<'EOF'...EOF), aspas duplas ou simples.
// Multiplos -m viram paragrafos (comportamento do git).
let msg = '';
const heredoc = cmd.match(/<<-?\s*'?(\w+)'?\s*\n([\s\S]*?)\n\1/);
if (heredoc) {
  msg = heredoc[2];
} else {
  const parts = [];
  const re = /-m\s+(?:"([\s\S]*?)"|'([\s\S]*?)')/g;
  let m;
  while ((m = re.exec(cmd)) !== null) parts.push(m[1] !== undefined ? m[1] : m[2]);
  msg = parts.join('\n\n');
}
if (!msg) process.exit(0); // nao extraiu -> falha aberto

const lines = msg.split('\n');
const subject = lines[0].trim();

// Tipos que exigem corpo (mudanca de comportamento/estrutura)
const t = subject.match(/^(feat|fix|refactor|perf)(\(.+\))?!?:/);
if (!t) process.exit(0);

// Corpo = linhas apos o assunto, ignorando vazias e trailers
const body = lines.slice(1).map((l) => l.trim()).filter((l) =>
  l !== '' && !/^co-authored-by:/i.test(l) && !/^signed-off-by:/i.test(l)
);
if (body.length > 0) process.exit(0);

const msgOut = [
  'BLOQUEADO pelo guard de rastro de decisao (CLAUDE.md).',
  'Commit ' + t[1] + ' sem corpo: falta o PORQUE da mudanca.',
  '',
  'Reescrever o commit com corpo contendo: motivo da mudanca, alternativa',
  'descartada (quando houver) e caminho de rollback (quando nao for obvio).',
  '',
  'Excecao legitima (mudanca realmente autoexplicativa): acrescentar o',
  'marcador  # CORPO-DISPENSADO  ao comando.'
].join('\n');

process.stderr.write(msgOut + '\n');
process.exit(2);
