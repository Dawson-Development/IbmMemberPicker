$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$out = Join-Path $root "vsix\ibm-member-opener-$($pkg.version).vsix"

New-Item -ItemType Directory -Force -Path (Join-Path $root 'vsix') | Out-Null

$env:NODE_OPTIONS = ''
$env:npm_config_node_options = ''

& npx vsce package --no-dependencies --out $out
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
