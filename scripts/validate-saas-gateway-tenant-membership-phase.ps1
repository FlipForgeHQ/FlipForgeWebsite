$ErrorActionPreference = 'Stop'

Write-Host '=== FlipForge SaaS gateway tenant membership ==='

function Invoke-NodeStep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Write-Host "--- $Name ---"
    & node @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Name failed." }
}

Invoke-NodeStep -Name 'Gateway JavaScript syntax' -Arguments @(
    '--check',
    'netlify/functions/flipforge-api.js'
)

Invoke-NodeStep -Name 'Retained API bridge validator syntax' -Arguments @(
    '--check',
    'scripts/validate-saas-api-bridge.mjs'
)

Invoke-NodeStep -Name 'Tenant membership validator syntax' -Arguments @(
    '--check',
    'scripts/validate-saas-gateway-tenant-membership.mjs'
)

Invoke-NodeStep -Name 'Retained fail-closed API bridge validation' -Arguments @(
    'scripts/validate-saas-api-bridge.mjs'
)

Invoke-NodeStep -Name 'Signed tenant membership validation' -Arguments @(
    'scripts/validate-saas-gateway-tenant-membership.mjs'
)

Invoke-NodeStep -Name 'Retained SaaS prototype validation' -Arguments @(
    'saas-prototype/validate.mjs'
)

Invoke-NodeStep -Name 'Retained website integration build' -Arguments @(
    'scripts/build-assets.js'
)

Write-Host 'Gateway tenant membership validation completed successfully.'
