#!/usr/bin/env node
// jb-session-mode-banner.js — UserPromptSubmit. Reinjeta o modo de sessão ativo a cada turno.
//
// Razão de existir: restrição colada no prompt morre na compactação; este lembrete renasce
// a cada mensagem, então o agente nunca "esquece" o modo. Silencioso sem modo ativo.
// O enforcement real é o jb-session-mode.js (PreToolUse); isto aqui é só o sinal.
//
// Falha ABERTO: qualquer erro -> exit 0 sem output.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function findRules(startDir) {
  try {
    let dir = path.resolve(startDir || process.cwd());
    for (let i = 0; i < 12; i++) {
      const f = path.join(dir, '.claude', 'session-rules.json');
      if (fs.existsSync(f)) {
        try { return { rules: JSON.parse(fs.readFileSync(f, 'utf8')), file: f }; } catch (_) { return null; }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    const home = path.join(os.homedir(), '.claude', 'session-rules.json');
    if (fs.existsSync(home)) {
      try { return { rules: JSON.parse(fs.readFileSync(home, 'utf8')), file: home }; } catch (_) { return null; }
    }
  } catch (_) { }
  return null;
}

try {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { process.exit(0); }
  let j = {};
  try { j = JSON.parse(raw || '{}'); } catch (_) { process.exit(0); }

  const found = findRules(j.cwd);
  if (!found || !found.rules || !found.rules.modo) process.exit(0);
  const r = found.rules;

  let expirado = false;
  if (r.valido_ate) {
    const t = Date.parse(r.valido_ate);
    if (!isNaN(t) && t < Date.now()) expirado = true;
  }

  const parts = ['MODO DE SESSÃO: ' + String(r.modo).toUpperCase()];
  if (r.repo_permitido) parts.push('repo permitido: ' + r.repo_permitido);
  if (Array.isArray(r.deny_extra) && r.deny_extra.length) parts.push('extras: ' + r.deny_extra.join(', '));
  if (expirado) {
    process.stdout.write('MODO DE SESSÃO EXPIROU (' + String(r.modo).toUpperCase() + ', válido até ' + r.valido_ate + '). Enforcement desativado. Renovar com /its-modo ou limpar com /its-modo off.\n');
  } else {
    if (r.valido_ate) parts.push('válido até ' + r.valido_ate);
    process.stdout.write(parts.join(' | ') + '. Enforcement determinístico via hook jb-session-mode: não é preciso repetir proibições no prompt.\n');
  }
  process.exit(0);
} catch (_) {
  process.exit(0);
}
