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

Invoke-Step "Parse staging readiness JavaScript" {
    node --check .\scripts\lib\saas-staging-readiness.mjs
    node --check .\scripts\check-saas-staging-readiness.mjs
    node --check .\scripts\validate-saas-staging-activation-readiness.mjs
}

Invoke-Step "Validate staging activation readiness" {
    node .\scripts\validate-saas-staging-activation-readiness.mjs
}

Invoke-Step "Validate documented tenant membership example" {
    node .\scripts\check-saas-staging-readiness.mjs `
        --membership .\docs\examples\saas-tenant-membership.example.json `
        --json
}

Invoke-Step "Validate retained staging evaluation submission" {
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

Write-Host "--- Enforce staging activation boundaries ---"
$gateway = Get-Content .\netlify\functions\flipforge-api.js -Raw
$netlify = Get-Content .\netlify.toml -Raw
$checker = Get-Content .\scripts\check-saas-staging-readiness.mjs -Raw
$library = Get-Content .\scripts\lib\saas-staging-readiness.mjs -Raw
$environmentExample = Get-Content .\docs\examples\saas-staging-environment.example.txt -Raw

if ($netlify -match 'FLIPFORGE_API_BRIDGE_ENABLED\s*=\s*["'']?true') {
    throw "The tracked Netlify configuration activates the API bridge."
}
if ($netlify -match 'FLIPFORGE_API_SERVICE_TOKEN|FLIPFORGE_API_BASE_URL') {
    throw "The tracked Netlify configuration contains staging upstream configuration."
}
if ($gateway -notmatch 'context !== "production"' -or $gateway -notmatch 'productionPreviewBypassAllowed: false') {
    throw "The gateway no longer proves that production preview bypass is forbidden."
}
if ($gateway -notmatch 'String\(process\.env\.FLIPFORGE_API_BRIDGE_ENABLED \|\| ""\).*=== "true"') {
    throw "The gateway is no longer disabled by default."
}
if ($checker -match 'console\.log\(process\.env\.FLIPFORGE_API_SERVICE_TOKEN') {
    throw "The readiness checker can print the raw service token."
}
if ($library -notmatch 'PRODUCTION_BRIDGE_ENABLED' -or $library -notmatch 'PRODUCTION_PREVIEW_BYPASS') {
    throw "The readiness library does not reject unsafe production activation."
}
if ($environmentExample -notmatch 'FLIPFORGE_API_BRIDGE_ENABLED=false' -or $environmentExample -notmatch '<set-in-secret-manager-only>') {
    throw "The staging environment example is not disabled and redacted."
}

Write-Host "Staging activation readiness validation completed successfully."
