#!/usr/bin/env node
// jb-its-prompt-router.js — UserPromptSubmit.
// Quando a mensagem cita uma acao relevante, injeta um lembrete curto do command ITS adequado.
// Silencioso quando nenhum gatilho casa. Nunca bloqueia, nunca trava.
// Para desligar: remover este hook do bloco UserPromptSubmit em settings.json.
// Para calibrar ruido: editar os regex abaixo.
'use strict';

let raw = '';
try { raw = require('fs').readFileSync(0, 'utf8'); } catch (_) { process.exit(0); }

let prompt = '';
try {
  const j = JSON.parse(raw || '{}');
  prompt = String(j.prompt || '');
} catch (_) { process.exit(0); }
if (!prompt) process.exit(0);

const p = prompt.toLowerCase();
const has = (re) => re.test(p);
const tips = [];

if (has(/\b(deploy|deployar|promover|promoc|promoç|produc|produç|production|homolog)\b/) || has(/\bprod\b/)) {
  tips.push('Mudanca rumo a deploy/producao: /its-premortem antes; /its-deploy-smoke na .96 depois. Producao so com os 3 gates + GO explicito.');
}
if (has(/\b(migration|migrations|migrate|alembic)\b/)) {
  tips.push('Migration: /its-premortem antes. No Portal, alembic upgrade head NAO roda no post-receive (passo manual via docker exec).');
}
if (has(/\b(merge|pre-merge|pull request|abrir pr|fechar pr)\b/)) {
  tips.push('Fechando trabalho: /its-pre-merge-review antes do merge/promocao.');
}
if (has(/\b(auth|autentic|rbac|tenant|token|jwt|audit|auditoria|seguranca|segurança|security|require_scope|escopo)\b/)) {
  tips.push('Area sensivel (auth/RBAC/tenant/token/audit): /its-security-review na area afetada.');
}
if (has(/\b(nova ferramenta|ferramenta nova|novo repo|repo novo|nova skill|skill nova|novo mcp|mcp novo)\b/) || has(/\bvale a pena (usar|instalar|adotar)\b/)) {
  tips.push('Ferramenta/repo/skill/MCP novo: /its-avaliar-ferramenta antes de adotar.');
}

if (tips.length === 0) process.exit(0);

process.stdout.write('Lembrete de fluxo ITS (auto):\n- ' + tips.join('\n- ') + '\n');
process.exit(0);
