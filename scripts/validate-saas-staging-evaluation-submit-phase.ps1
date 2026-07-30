$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    Write-Host "--- $Name ---"
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE."
    }
}

Invoke-Step "Parse staging evaluation JavaScript" {
    node --check .\saas-prototype\staging-evaluation.js
    node --check .\saas-prototype\staging-route-hook.js
    node --check .\scripts\validate-saas-staging-evaluation-submit.mjs
}

Invoke-Step "Validate staging evaluation submission" {
    node .\scripts\validate-saas-staging-evaluation-submit.mjs
}

Invoke-Step "Validate retained staging browser reads" {
    node .\scripts\validate-saas-staging-browser-read-adapter.mjs
}

Invoke-Step "Validate retained API bridge" {
    node .\scripts\validate-saas-api-bridge.mjs
}

Invoke-Step "Validate retained gateway tenant membership" {
    node .\scripts\validate-saas-gateway-tenant-membership.mjs
}

Invoke-Step "Validate retained SaaS prototype" {
    node .\saas-prototype\validate.mjs
}

Invoke-Step "Build retained website assets" {
    node .\scripts\build-assets.js
}

Write-Host "--- Enforce staging evaluation browser boundaries ---"
$adapter = Get-Content .\saas-prototype\staging-evaluation.js -Raw
$hook = Get-Content .\saas-prototype\staging-route-hook.js -Raw
$index = Get-Content .\saas-prototype\index.html -Raw

if ($adapter -match 'X-FlipForge-Tenant-Id|X-FlipForge-User-Id|FLIPFORGE_API_SERVICE_TOKEN') {
    throw "The browser evaluation adapter contains a forbidden trusted identity or service-token identifier."
}
if ($adapter -match 'localStorage|sessionStorage|document\.cookie') {
    throw "The browser evaluation adapter persists sensitive request state."
}
if ($adapter -notmatch 'const EVALUATION_PATH = "/api/v1/evaluations"') {
    throw "The browser evaluation adapter does not use the fixed same-origin evaluation path."
}
if ($adapter -notmatch 'method: "POST"' -or $adapter -notmatch '"Idempotency-Key": idempotencyKey') {
    throw "The browser evaluation adapter does not enforce POST plus idempotency."
}
if ($adapter -notmatch 'data\.transactionAuthorized === false' -or $adapter -notmatch 'data\.tenantOwned === true') {
    throw "The browser evaluation adapter does not enforce transaction denial and tenant ownership."
}
if ($hook -notmatch 'route !== "staging-evaluate"' -or $hook -notmatch 'evaluationAdapter\.render\(main\)') {
    throw "The shared route hook does not isolate the staging evaluation route."
}
if ($index -notmatch 'data-route="staging-evaluate"[^>]*hidden') {
    throw "The staging evaluation navigation is not hidden by default."
}

Write-Host "Staging evaluation submission validation completed successfully."
