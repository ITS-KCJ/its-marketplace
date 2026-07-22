#!/usr/bin/env node
// jb-session-mode.js — PreToolUse(Bash|Edit|Write|MultiEdit). Enforcement do modo de sessão (/its-modo).
//
// Lê .claude/session-rules.json (procurando do cwd para cima) e bloqueia ações fora do modo.
// DENY-ONLY e ADITIVO: nunca libera nada que outro guard (jb-its-prod-guard) bloquearia.
// Sem arquivo de regras, ou com regras expiradas: silencioso.
//
// Filosofia: falha ABERTO. Qualquer erro de parsing -> não bloqueia (não trava o fluxo).
// Para desligar: /its-modo off, ou remover este hook do bloco PreToolUse em settings.json.
// GO Fase 1 do Julio em 2026-07-03 (auditoria de sessões).
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Retorna { rules, file } quando encontra e faz parse com sucesso,
// { invalid: true, file } quando encontra mas o JSON é inválido (bloqueia, não falha aberto -
// arquivo de regra corrompido é estado desconhecido, não "sem regra"), ou null quando não encontra nada.
function findRules(startDir) {
  try {
    let dir = path.resolve(startDir || process.cwd());
    for (let i = 0; i < 12; i++) {
      const f = path.join(dir, '.claude', 'session-rules.json');
      if (fs.existsSync(f)) {
        try { return { rules: JSON.parse(fs.readFileSync(f, 'utf8')), file: f }; }
        catch (_) { return { invalid: true, file: f }; }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    const home = path.join(os.homedir(), '.claude', 'session-rules.json');
    if (fs.existsSync(home)) {
      try { return { rules: JSON.parse(fs.readFileSync(home, 'utf8')), file: home }; }
      catch (_) { return { invalid: true, file: home }; }
    }
  } catch (_) { /* falha aberto: erro ao procurar o arquivo (ex.: permissão) não bloqueia */ }
  return null;
}

// Negações por token. Token desconhecido é ignorado (falha aberto).
const DENY = {
  'push':          { re: /\bgit\s+push\b/i, desc: 'git push' },
  'commit':        { re: /\bgit\s+commit\b/i, desc: 'git commit' },
  'merge':         { re: /(\bgit\s+merge\b|\bgh\s+pr\s+merge\b)/i, desc: 'merge' },
  'migration':     { re: /(\balembic\s+(upgrade|downgrade)\b|\bmanage\.py\s+migrate\b)/i, desc: 'migration' },
  'ssh':           { re: /(^|[\s;&|("'])(ssh|scp|sftp)\b/i, desc: 'ssh/scp/sftp' },
  'ip-rede':       { re: /10\.70\.1\.\d+/, desc: 'acesso a VM da rede ITS' },
  'docker-remoto': { re: /(\bssh\b[\s\S]*\bdocker\s+cp\b|\bssh\b[\s\S]*\bpip\s+install\b|\bdocker\s+(-H|--host)\b)/i, desc: 'sync ad-hoc em container remoto' },
  'deploy':        { re: /(\bdeploy\.(sh|py)\b|\bgit\s+push\s+(vm|hml)\b)/i, desc: 'script/push de deploy' },
  // --- LAB_OK (GO-B1 de Julio, 2026-07-18): escopo restrito a provisionar a gw01.
  // 'ip-lab-guard' NAO e' regex: e' logica especial (funcao ipGuard) DATA-DRIVEN —
  // bloqueia TODO 10.70.1.x EXCETO .3 (pve03, fixo) e o IP em rules.ip_aprovado (gw01).
  // Cobre os bloqueios de .96/.121/.122/.123 e qualquer VM existente. 'host-fora-lab'
  // barra hosts Proxmox alem do pve03. ---
  'host-fora-lab': { re: /(^|[\s;&|("'])(pve1|pve2|pve4|pve5|pveaux|pbs)\b/i, desc: 'host Proxmox fora do pve03' },
  // 'qm-vmid-guard' NAO e' regex: e' logica especial (funcao qmGuard). Verbos read-only
  // de qm (list/status/config) liberados; create/set/start/importdisk SO' para o VMID
  // aprovado (rules.vmid_aprovado); sem VMID aprovado, TODO qm mutante bloqueado;
  // destroy/stop/migrate/rollback/clone/etc sempre bloqueados.
  'proxmox-infra': { re: /\b(pvecm|pveceph)\b|\bpvesm\s+(add|remove|set|alloc|free|import|export|extractconfig)\b|\bpve-firewall\s+(start|stop|restart|compile|localnet|update)\b|\bvzdump\b|\bproxmox-backup-(manager|client)\b|\bpvesh\s+(set|create|delete)\b|\/etc\/network\/interfaces|\/etc\/pve\/|\bifreload\b|\bbrctl\b|\bovs-vsctl\b/i, desc: 'mutacao de storage/cluster/bridge/firewall-global/backup/config do Proxmox (read-only como pvesm status / pvesh get fica liberado)' },
  'edge-config':   { re: /dispatcher\.list|\bkamcmd\b|\bkamctl\b/i, desc: 'config do Kamailio/dispatcher (edge)' },
};

// Modos deny-only. PROD_READONLY/PROD_GO ficam para depois do refactor do jb-its-prod-guard (GO separado).
const MODES = {
  LOCAL_ONLY: ['push', 'merge', 'migration', 'ssh', 'ip-rede', 'docker-remoto', 'deploy'],
  HML_OK: ['docker-remoto'],
  // LAB_OK: libera ssh + IP .3 (pve03) e rules.ip_aprovado (gw01) e os verbos qm gated
  // no VMID aprovado; bloqueia todo o resto do LAB, mutacao de VM existente, infra do
  // Proxmox, edge/dispatcher e deploy. Escopo do GO-B1; validade curta + fallback LOCAL_ONLY.
  LAB_OK: ['ip-lab-guard', 'host-fora-lab', 'qm-vmid-guard', 'proxmox-infra', 'edge-config', 'push', 'deploy', 'migration', 'docker-remoto'],
};

// ipGuard: allowlist DATA-DRIVEN de IPs 10.70.1.x sob LAB_OK (GO Julio 2026-07-18).
// Libera SO' 10.70.1.3 (pve03, fixo) e rules.ip_aprovado. Este pode ser STRING (1 IP,
// legado) ou ARRAY (N IPs; GO-C1B0 2026-07-19). Valor invalido/tipo inesperado/array
// vazio -> ignorado (allowlist so amplia com IP valido). Qualquer outro 10.70.1.x
// no comando -> bloqueado (cobre .96/.121/.122/.123 e VMs existentes).
// Retorna a string do motivo, ou null se permitido.
function ipGuard(cmd, rules) {
  const allowed = new Set(['10.70.1.3']);
  const isValidIp = (s) =>
    typeof s === 'string' &&
    /^\d{1,3}(\.\d{1,3}){3}$/.test(s.trim()) &&
    s.trim().split('.').every((o) => Number(o) <= 255);
  if (rules && rules.ip_aprovado != null) {
    const list = Array.isArray(rules.ip_aprovado) ? rules.ip_aprovado : [rules.ip_aprovado];
    for (const ip of list) {
      if (isValidIp(ip)) allowed.add(String(ip).trim());
      // valor invalido / tipo inesperado -> ignorado (allowlist NUNCA amplia por erro)
    }
  }
  const re = /\b10\.70\.1\.\d{1,3}\b/g;
  let m;
  while ((m = re.exec(String(cmd))) !== null) {
    if (!allowed.has(m[0])) {
      return 'IP ' + m[0] + ' fora do escopo LAB_OK (liberados: ' + Array.from(allowed).join(', ') + ')';
    }
  }
  return null;
}

// qmGuard: politica VMID-aware para comandos `qm` sob LAB_OK (GO Julio 2026-07-18).
// - verbos read-only (list/status/config/...) -> liberado (preflight B0);
// - verbos de provisionamento (create/set/start/importdisk/...) -> SO' para o VMID
//   aprovado em rules.vmid_aprovado; sem VMID aprovado, TODOS bloqueados;
// - qualquer outro verbo (destroy/stop/migrate/rollback/clone/...) -> sempre bloqueado.
// Retorna a string do motivo do bloqueio, ou null se permitido.
function qmGuard(cmd, rules) {
  const m = String(cmd).match(/\bqm\s+([a-z][a-z0-9_-]*)\b(?:\s+(\d+))?/i);
  if (!m) return null;
  const verb = m[1].toLowerCase();
  const READ = new Set(['list', 'status', 'config', 'pending', 'showcmd', 'listsnapshot']);
  if (READ.has(verb)) return null;
  // GATED: provisionamento (create/set/start/importdisk/...) E lifecycle de rollback
  // (stop/shutdown/destroy/reboot) — permitidos SO' para o VMID aprovado. Demais verbos
  // (migrate/clone/template/snapshot/rollback/move-disk/...) sempre bloqueados.
  const GATED = new Set(['create', 'set', 'start', 'importdisk', 'importovf', 'resize', 'disk', 'stop', 'shutdown', 'destroy', 'reboot']);
  const vmidAprov = (rules && rules.vmid_aprovado != null) ? String(rules.vmid_aprovado) : null;
  if (GATED.has(verb)) {
    if (!vmidAprov) return 'qm ' + verb + ' bloqueado: nenhum VMID aprovado ainda (preflight so permite qm list/status/config)';
    const vmid = m[2] || null;
    if (!vmid) return 'qm ' + verb + ' sem VMID identificado; so o VMID aprovado (' + vmidAprov + ') e permitido';
    if (vmid !== vmidAprov) return 'qm ' + verb + ' no VMID ' + vmid + ' bloqueado; so o VMID aprovado (' + vmidAprov + ') e permitido';
    return null;
  }
  return 'qm ' + verb + ' (verbo nao permitido: migrate/clone/template/snapshot/rollback/...) bloqueado no modo LAB_OK';
}

function main() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { return 0; }
  let j;
  try { j = JSON.parse(raw || '{}'); } catch (_) { return 0; }

  const found = findRules(j.cwd);
  if (!found) return 0;
  if (found.invalid) {
    block('session-rules.json inválido (JSON malformado) em ' + found.file + '. Corrija o arquivo ou rode /its-modo off', null, found.file);
    return 2;
  }
  const rules = found.rules;

  const modo = String(rules.modo || '').toUpperCase();

  // Expiração: NUNCA ficar sem enforcement quando um modo endurecido expira.
  // Se houver fallback_modo (ou se o modo for LAB_OK), passa a enforçar o modo de
  // fallback (default LOCAL_ONLY) = restaura automaticamente o modo anterior. Demais
  // modos sem fallback mantêm o legado (silencioso ao expirar). GO Julio 2026-07-18.
  let effectiveModo = modo;
  if (rules.valido_ate) {
    const t = Date.parse(rules.valido_ate);
    if (!isNaN(t) && t < Date.now()) {
      const fb = rules.fallback_modo ? String(rules.fallback_modo).toUpperCase()
                 : (modo === 'LAB_OK' ? 'LOCAL_ONLY' : null);
      if (fb && MODES[fb]) { effectiveModo = fb; }
      else { return 0; }
    }
  }

  const tokens = new Set(MODES[effectiveModo] || []);
  const extras = Array.isArray(rules.deny_extra) ? rules.deny_extra : [];
  extras.forEach((t) => tokens.add(String(t).toLowerCase().replace(/^nao-/, '')));

  const tool = String(j.tool_name || '');
  const input = (j.tool_input && typeof j.tool_input === 'object') ? j.tool_input : {};

  // 1) Bash: comando contra os tokens ativos
  if (tool === 'Bash') {
    const cmd = String(input.command || '');
    if (!cmd) return 0;
    for (const t of tokens) {
      if (t === 'ip-lab-guard') {
        const reason = ipGuard(cmd, rules);
        if (reason) { block(reason, effectiveModo, found.file); return 2; }
        continue;
      }
      if (t === 'qm-vmid-guard') {
        const reason = qmGuard(cmd, rules);
        if (reason) { block(reason, effectiveModo, found.file); return 2; }
        continue;
      }
      const d = DENY[t];
      if (d && d.re.test(cmd)) {
        block('comando casa com deny "' + t + '" (' + d.desc + ')', effectiveModo, found.file);
        return 2;
      }
    }
    return 0;
  }

  // 2) Edit/Write/MultiEdit fora do repo permitido. Só fiscaliza dentro da base de projetos,
  //    para não atrapalhar escrita em scratchpad, vault, ~/.claude etc.
  if (rules.repo_permitido && /^(Edit|Write|MultiEdit)$/.test(tool)) {
    const fp = String(input.file_path || '');
    if (!fp) return 0;
    let norm;
    try { norm = path.resolve(fp).toLowerCase().replace(/\//g, '\\'); } catch (_) { return 0; }
    const base = 'c:\\dev\\projetos\\';
    if (norm.startsWith(base)) {
      let repo;
      try { repo = path.resolve(String(rules.repo_permitido)).toLowerCase().replace(/\//g, '\\'); } catch (_) { return 0; }
      if (norm !== repo && !norm.startsWith(repo + '\\')) {
        block('escrita em ' + fp + ' fora do repo permitido (' + rules.repo_permitido + ')', modo, found.file);
        return 2;
      }
    }
  }
  return 0;
}

function block(reason, modo, file) {
  process.stderr.write([
    'BLOQUEADO pelo modo de sessão ' + (modo || '(extras)') + ' (jb-session-mode).',
    'Motivo: ' + reason + '.',
    'Regras ativas: ' + file,
    'Não contornar reescrevendo o comando. Se a ação é necessária, o Julio muda o modo: /its-modo <MODO> ou /its-modo off.',
  ].join('\n') + '\n');
}

process.exit(main());
