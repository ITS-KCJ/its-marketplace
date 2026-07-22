#!/usr/bin/env node
// jb-handoff-auto.js — PreCompact + SessionEnd + SessionStart. Handoff automático de estado.
//
// PreCompact/SessionEnd: grava <repo>/.planning/HANDOFF-AUTO.md com branch, status, commits,
// PR/runs (gh, com timeout curto) e regras de sessão ativas. É a versão automática do
// /context-compressor, disparada ANTES do resumo destrutivo ou do fim da sessão.
// SessionStart: se existe HANDOFF-AUTO.md com menos de 24h, avisa o agente para ler.
//
// Fora de repo git: não faz nada. Falha ABERTO: qualquer erro -> exit 0.
// GO Fase 1 do Julio em 2026-07-03 (auditoria de sessões).
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function sh(cmd, cwd, timeoutMs) {
  try {
    return execSync(cmd, { cwd, timeout: timeoutMs || 3000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).toString('utf8').trim();
  } catch (_) { return null; }
}

function findSessionRules(startDir) {
  try {
    let dir = path.resolve(startDir);
    for (let i = 0; i < 12; i++) {
      const f = path.join(dir, '.claude', 'session-rules.json');
      if (fs.existsSync(f)) return f;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch (_) { }
  return null;
}

try {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { process.exit(0); }
  let j = {};
  try { j = JSON.parse(raw || '{}'); } catch (_) { process.exit(0); }

  const cwd = j.cwd || process.cwd();
  const event = String(j.hook_event_name || '');

  const repoRoot = sh('git rev-parse --show-toplevel', cwd, 3000);
  if (!repoRoot) process.exit(0);
  const handoff = path.join(repoRoot, '.planning', 'HANDOFF-AUTO.md');

  if (event === 'SessionStart') {
    if (fs.existsSync(handoff)) {
      const ageH = (Date.now() - fs.statSync(handoff).mtimeMs) / 3600000;
      if (ageH < 24) {
        process.stdout.write('Handoff recente encontrado (' + ageH.toFixed(1) + 'h): .planning/HANDOFF-AUTO.md. Ler antes de agir para retomar estado (branch, commits, PR/run, regras ativas).\n');
      }
    }
    process.exit(0);
  }

  // PreCompact / SessionEnd: gerar o handoff
  const branch = sh('git branch --show-current', repoRoot, 3000) || '(detached)';
  const statusSb = sh('git status -sb', repoRoot, 3000) || '';
  const statusLines = statusSb.split('\n');
  const tracking = statusLines[0] || '';
  const changes = statusLines.slice(1, 31);
  const truncated = statusLines.length > 31 ? ('... e mais ' + (statusLines.length - 31) + ' arquivos') : '';
  const commits = sh('git log --oneline -5', repoRoot, 3000) || '(sem commits)';
  const stash = sh('git stash list', repoRoot, 3000) || '';

  // gh é opcional e lento: timeout curto, falha silenciosa
  const pr = sh('gh pr status --json currentBranch --jq ".currentBranch | if . then \\"#\\(.number) \\(.title) [\\(.state)]\\" else empty end"', repoRoot, 4000);
  const runs = sh('gh run list -L 3 --json displayTitle,status,conclusion --jq ".[] | \\"\\(.displayTitle) - \\(.status)/\\(.conclusion // \\"-\\")\\""', repoRoot, 4000);

  let rules = '';
  const rulesFile = findSessionRules(cwd);
  if (rulesFile) {
    try { rules = fs.readFileSync(rulesFile, 'utf8').trim(); } catch (_) { }
  }

  const now = new Date();
  const md = [
    '# HANDOFF-AUTO (gerado por hook, evento: ' + event + ')',
    '',
    'Gerado em: ' + now.toISOString() + ' | Repo: ' + repoRoot,
    'Este arquivo é sobrescrito a cada compactação/fim de sessão. Para handoff curado use /gsd-pause-work ou /context-compressor.',
    '',
    '## Git',
    '- Branch: `' + branch + '`',
    '- Tracking: `' + tracking + '`',
    '',
    '### Alterações não commitadas' + (changes.filter(Boolean).length ? '' : ': nenhuma'),
    ...(changes.filter(Boolean).length ? ['```', ...changes.filter(Boolean), truncated, '```'].filter(Boolean) : []),
    '',
    '### Últimos commits',
    '```',
    commits,
    '```',
    stash ? '\n### Stash\n```\n' + stash + '\n```' : '',
    pr ? '\n## PR ativo\n' + pr : '',
    runs ? '\n## Últimos runs de CI\n```\n' + runs + '\n```' : '',
    rules ? '\n## Regras de sessão ativas (session-rules.json)\n```json\n' + rules + '\n```' : '',
    '',
    '## Retomada',
    'Ao retomar a partir deste arquivo: conferir `git status` real antes de agir; decisões e próximos passos que não estão aqui estavam só no chat e podem ter se perdido na compactação. Na dúvida, perguntar ao Julio em 1 linha o que estava em andamento.',
    '',
  ].filter((l) => l !== null && l !== undefined).join('\n');

  const planningDir = path.join(repoRoot, '.planning');
  if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(handoff, md, 'utf8');

  if (event === 'PreCompact') {
    process.stdout.write('Handoff automático atualizado em .planning/HANDOFF-AUTO.md antes da compactação. Se este for o 2º compact da sessão, sugerir ao Julio encerrar e reabrir a partir do handoff.\n');
  }
  process.exit(0);
} catch (_) {
  process.exit(0);
}
