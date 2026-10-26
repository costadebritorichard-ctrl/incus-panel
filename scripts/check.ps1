$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
python -m unittest discover -s tests -v
if ($LASTEXITCODE -ne 0) { throw 'Testes falharam' }
node --check web/app.js
if ($LASTEXITCODE -ne 0) { throw 'JavaScript inválido' }
python scripts/traceability.py --check
if ($LASTEXITCODE -ne 0) { throw 'Rastreabilidade desatualizada' }
