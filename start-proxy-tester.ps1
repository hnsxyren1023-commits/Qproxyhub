$ErrorActionPreference = 'Stop'

$nodeExe = 'C:\Program Files\nodejs\node.exe'
$serverScript = Join-Path $PSScriptRoot 'server.mjs'

if (-not (Test-Path -LiteralPath $nodeExe)) {
  throw "Cannot find Node.js at $nodeExe"
}

if (-not (Test-Path -LiteralPath $serverScript)) {
  throw "Cannot find server script at $serverScript"
}

& $nodeExe $serverScript
