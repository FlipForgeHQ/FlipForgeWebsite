$ErrorActionPreference = 'Stop'

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    Write-Host "--- $Name ---"
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed."
    }
}

Invoke-Step 'Parse staging browser adapter' {
    node --check .\saas-prototype\staging-browser.js
}

Invoke-Step 'Parse staging route hook' {
    node --check .\saas-prototype\staging-route-hook.js
}

Invoke-Step 'Parse staging browser validation' {
    node --check .\scripts\validate-saas-staging-browser-read-adapter.mjs
}

Invoke-Step 'Validate staging browser read adapter' {
    node .\scripts\validate-saas-staging-browser-read-adapter.mjs
}

Invoke-Step 'Validate retained API bridge' {
    node .\scripts\validate-saas-api-bridge.mjs
}

Invoke-Step 'Validate retained gateway tenant membership' {
    node .\scripts\validate-saas-gateway-tenant-membership.mjs
}

Invoke-Step 'Validate retained SaaS prototype' {
    node .\saas-prototype\validate.mjs
}

Invoke-Step 'Build retained website assets' {
    node .\scripts\build-assets.js
}

Write-Host 'Staging browser read adapter validation completed successfully.'
