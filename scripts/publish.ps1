param([string]$Repository = 'incus-panel')
$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspacePath
function Assert-Success([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "Falha: $Step" }
}
git -c "safe.directory=$workspacePath" rev-parse --git-dir | Out-Null
Assert-Success 'abrir repositório local'
git -c "safe.directory=$workspacePath" show-ref --verify --quiet refs/heads/main
$hasMain = $LASTEXITCODE -eq 0
if (-not $hasMain -and (Test-Path -LiteralPath "$workspacePath/.git-local/HEAD")) {
    git -c "safe.directory=$workspacePath" fetch "$workspacePath/.git-local" 'main:refs/heads/main'
    Assert-Success 'importar commits preservados em .git-local'
    git -c "safe.directory=$workspacePath" symbolic-ref HEAD refs/heads/main
    Assert-Success 'selecionar main'
    git -c "safe.directory=$workspacePath" reset --mixed main
    Assert-Success 'reconstruir índice sem alterar arquivos'
}
git -c "safe.directory=$workspacePath" status --short
gh auth status
Assert-Success 'autenticação GitHub; execute gh auth login -h github.com'
$owner = gh api user --jq .login
Assert-Success 'consultar conta GitHub'
$fullName = "$owner/$Repository"
gh repo view $fullName --json nameWithOwner 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    gh repo create $fullName --private --description 'Painel leve para administrar laboratórios Incus em ARMv7, ARM64 e x86-64'
    Assert-Success 'criar repositório privado'
}
$remoteUrl = "https://github.com/$fullName.git"
$currentRemote = git -c "safe.directory=$workspacePath" remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0) {
    git -c "safe.directory=$workspacePath" remote add origin $remoteUrl
    Assert-Success 'configurar origin'
} elseif ($currentRemote -ne $remoteUrl) {
    throw "Origin existente é diferente: $currentRemote. Não foi substituído."
}
gh auth setup-git
Assert-Success 'configurar autenticação Git'
git -c "safe.directory=$workspacePath" push -u origin main
Assert-Success 'publicar histórico (sem force push)'
Write-Output "Repositório publicado: https://github.com/$fullName"
