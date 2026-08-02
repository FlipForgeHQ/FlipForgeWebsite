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

Invoke-Step "Parse staging live proof JavaScript" {
    node --check .\scripts\lib\saas-staging-live-proof.mjs
    node --check .\scripts\run-saas-staging-live-proof.mjs
    node --check .\scripts\validate-saas-staging-live-proof.mjs
}

Invoke-Step "Validate staging live proof harness" {
    node .\scripts\validate-saas-staging-live-proof.mjs
}

Invoke-Step "Retain staging activation readiness" {
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-saas-staging-activation-readiness-phase.ps1
}

Write-Host "--- Enforce live-proof repository boundaries ---"
$proofEngine = Get-Content .\scripts\lib\saas-staging-live-proof.mjs -Raw
$runner = Get-Content .\scripts\run-saas-staging-live-proof.mjs -Raw
$netlify = Get-Content .\netlify.toml -Raw
$gateway = Get-Content .\netlify\functions\flipforge-api.js -Raw
$modernGateway = Get-Content .\netlify\modern-functions\flipforge-api.mjs -Raw

if ($netlify -match 'FLIPFORGE_API_BRIDGE_ENABLED\s*=\s*["'']?true') {
    throw "Tracked Netlify configuration must not activate the staging bridge."
}
if ($netlify -match 'FLIPFORGE_API_SERVICE_TOKEN|FLIPFORGE_API_BASE_URL') {
    throw "Tracked Netlify configuration must not contain live staging upstream configuration."
}
if ($proofEngine -notmatch 'RUN_STAGING_WRITE_PROOF') {
    throw "Live proof must require explicit staging write acknowledgment."
}
if ($proofEngine -notmatch 'Production FlipForge hosts are forbidden') {
    throw "Live proof must explicitly reject production hosts."
}
if ($proofEngine -notmatch 'deploy-preview-' -or $proofEngine -notmatch 'APPROVED_STAGING_HOST') {
    throw "Live proof must restrict credential use to approved FlipForge deploy-preview hosts."
}
if ($proofEngine -match 'X-FlipForge-Tenant-Id\s*["'']?\s*:') {
    throw "Live proof client must never inject the trusted tenant header."
}
if ($proofEngine -match 'X-FlipForge-User-Id\s*["'']?\s*:') {
    throw "Live proof client must never inject a raw user header."
}
if ($proofEngine -notmatch 'transactionAuthorized !== false') {
    throw "Live proof must fail if transaction authority appears."
}
if ($proofEngine -notmatch 'Smart Opportunity' -or $proofEngine -notmatch 'Existing PSA intelligence') {
    throw "Live proof must retain recommendation and grading authority checks."
}
if ($proofEngine -match 'FLIPFORGE_STAGING_USER_[AB]_JWT|headers\.Authorization\s*=') {
    throw "Live proof must not use browser Identity JWT or Bearer-header transport."
}
if ($proofEngine -notmatch '/\.netlify/identity/token' -or $proofEngine -notmatch 'headers\.Cookie\s*=\s*session') {
    throw "Live proof must establish and carry secure same-origin Identity cookie sessions."
}
if ($modernGateway -notmatch 'getUser\(\)' -or $modernGateway -notmatch 'secure-same-origin-cookie') {
    throw "Modern gateway must retain verified cookie-session authentication."
}
if ($runner -match 'FLIPFORGE_STAGING_USER_A_PASSWORD\s*=|FLIPFORGE_STAGING_USER_B_PASSWORD\s*=') {
    throw "Live proof runner must not contain embedded Identity passwords."
}
if ($gateway -notmatch 'productionPreviewBypassAllowed: false') {
    throw "Gateway must continue to forbid production preview bypass."
}

Write-Host "Staging live proof phase validation completed successfully."
