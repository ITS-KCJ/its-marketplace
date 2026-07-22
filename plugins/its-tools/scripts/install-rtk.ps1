# install-rtk.ps1 — instala o RTK (Rust Token Killer) da ITS
# Baixa o último release Windows de github.com/rtk-ai/rtk para ~\.local\bin
# e garante o diretório no PATH do usuário. Idempotente: rodar de novo atualiza.

$ErrorActionPreference = 'Stop'

$binDir = Join-Path $env:USERPROFILE '.local\bin'
New-Item -ItemType Directory -Force $binDir | Out-Null

Write-Host "Consultando último release do rtk..."
$release = Invoke-RestMethod 'https://api.github.com/repos/rtk-ai/rtk/releases/latest'
$asset = $release.assets | Where-Object { $_.name -eq 'rtk-x86_64-pc-windows-msvc.zip' }
if (-not $asset) { throw "Asset Windows não encontrado no release $($release.tag_name)" }

$zip = Join-Path $env:TEMP 'rtk-install.zip'
Write-Host "Baixando rtk $($release.tag_name)..."
Invoke-WebRequest $asset.browser_download_url -OutFile $zip

$extract = Join-Path $env:TEMP 'rtk-install'
if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
Expand-Archive $zip -DestinationPath $extract
$exe = Get-ChildItem $extract -Recurse -Filter 'rtk.exe' | Select-Object -First 1
if (-not $exe) { throw "rtk.exe não encontrado no zip" }
Copy-Item $exe.FullName (Join-Path $binDir 'rtk.exe') -Force
Remove-Item $zip -Force; Remove-Item -Recurse -Force $extract

# PATH do usuário
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$binDir*") {
    [Environment]::SetEnvironmentVariable('Path', "$userPath;$binDir", 'User')
    Write-Host "PATH do usuário atualizado (reabra o terminal para valer)."
}

& (Join-Path $binDir 'rtk.exe') --version
Write-Host ''
Write-Host 'RTK instalado. Para ativar a interceptação automática em um projeto,'
Write-Host 'adicione ao .claude/settings.local.json do projeto:'
Write-Host '  {"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"rtk hook claude"}]}]}}'
Write-Host ''
Write-Host 'Regra ITS: onde a evidência exige saída bruta (pytest, bateria de validação),'
Write-Host 'use `rtk proxy <cmd>` para preservar a saída completa.'
