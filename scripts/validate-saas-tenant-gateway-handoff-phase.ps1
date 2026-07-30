param(
    [string]$FlipForge2Path = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$websiteRoot = Split-Path -Parent $PSScriptRoot
Set-Location $websiteRoot

if ([string]::IsNullOrWhiteSpace($FlipForge2Path)) {
    $FlipForge2Path = Join-Path (Split-Path -Parent $websiteRoot) "FlipForge2"
}
$backendRoot = [System.IO.Path]::GetFullPath($FlipForge2Path)
if (-not (Test-Path $backendRoot)) {
    throw "FlipForge2 repository was not found at $backendRoot"
}

$isWindowsHost = $env:OS -eq "Windows_NT"
$maven = if ($isWindowsHost) {
    Join-Path $backendRoot "mvnw.cmd"
} else {
    Join-Path $backendRoot "mvnw"
}
if (-not (Test-Path $maven)) {
    throw "FlipForge2 Maven wrapper was not found at $maven"
}
if ($null -eq (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required to validate the FlipForge website gateway."
}

function Write-StepHeader {
    param([Parameter(Mandatory = $true)][string]$Name)
    Write-Host ""
    Write-Host "========================================"
    Write-Host "RUNNING: $Name"
    Write-Host "========================================"
}

function Invoke-MavenStep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )
    Write-StepHeader -Name $Name
    Push-Location $backendRoot
    try {
        & $maven @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Name failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

function Invoke-MavenRunner {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$MainClass,
        [bool]$DisableDaemonCleanup = $false
    )
    $arguments = @(
        "-B",
        "-Dexec.mainClass=$MainClass",
        "-Dexec.classpathScope=runtime"
    )
    if ($DisableDaemonCleanup) {
        $arguments += "-Dexec.cleanupDaemonThreads=false"
    }
    $arguments += "org.codehaus.mojo:exec-maven-plugin:3.5.0:java"
    Invoke-MavenStep -Name $Name -Arguments $arguments
}

function Invoke-NodeStep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )
    Write-StepHeader -Name $Name
    Push-Location $websiteRoot
    try {
        & node @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Name failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

function Require-Markers {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string[]]$Markers
    )
    foreach ($marker in $Markers) {
        if (-not $Text.Contains($marker)) {
            throw "Required $Name marker is missing: $marker"
        }
    }
}

function Assert-GatewayHandoffArchitecture {
    $tenantContextFile = Join-Path $backendRoot "src/main/java/com/flipforge2/saas/SaaSTenantContext.java"
    $tenantProjectionFile = Join-Path $backendRoot "src/main/java/com/flipforge2/saas/SaaSTenantScopedProjectionService.java"
    $tenantEvaluationFile = Join-Path $backendRoot "src/main/java/com/flipforge2/saas/SaaSTenantAuthoritativeEvaluationService.java"
    $baseEvaluationFile = Join-Path $backendRoot "src/main/java/com/flipforge2/saas/SaaSAuthoritativeEvaluationService.java"
    $serverFile = Join-Path $backendRoot "src/main/java/com/flipforge2/saas/SaaSPrivateHttpServer.java"
    $gatewayFile = Join-Path $websiteRoot "netlify/functions/flipforge-api.js"
    $validatorFile = Join-Path $websiteRoot "scripts/validate-saas-api-bridge.mjs"
    $docsFile = Join-Path $websiteRoot "docs/SAAS_API_BRIDGE.md"

    $requiredFiles = @(
        $tenantContextFile,
        $tenantProjectionFile,
        $tenantEvaluationFile,
        $baseEvaluationFile,
        $serverFile,
        $gatewayFile,
        $validatorFile,
        $docsFile
    )
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path $file)) {
            throw "Required gateway-handoff file is missing: $file"
        }
    }

    $tenantContextText = Get-Content $tenantContextFile -Raw
    $tenantProjectionText = Get-Content $tenantProjectionFile -Raw
    $tenantEvaluationText = Get-Content $tenantEvaluationFile -Raw
    $baseEvaluationText = Get-Content $baseEvaluationFile -Raw
    $serverText = Get-Content $serverFile -Raw
    $gatewayText = Get-Content $gatewayFile -Raw

    Require-Markers -Name "merged tenant context" -Text $tenantContextText -Markers @(
        'TRUSTED_HEADER = "X-FlipForge-Tenant-Id"',
        'MessageDigest.getInstance("SHA-256")',
        "SAFE_ID",
        "auditKey()"
    )

    Require-Markers -Name "merged tenant read" -Text $tenantProjectionText -Markers @(
        'put("tenantIsolation", new JSONObject()',
        'put("enforced", true)',
        'put("defaultAccess", "DENY")',
        "isOpportunityAllowed",
        "SaaSResourceNotFoundException"
    )

    Require-Markers -Name "merged tenant evaluation" -Text $tenantEvaluationText -Markers @(
        'put("tenantOwned", true)',
        'put("idempotencyScope", "TENANT")',
        'put("opportunityOwnership", "GRANTED_ON_COMPLETION")',
        "completeAndGrant"
    )
    Require-Markers -Name "retained transaction boundary" -Text $baseEvaluationText -Markers @(
        'put("transactionAuthorized", false)',
        "SimpleOpportunityEvaluationService",
        "evaluateAndSave"
    )

    Require-Markers -Name "authoritative HTTP tenant boundary" -Text $serverText -Markers @(
        "SaaSTenantContext.TRUSTED_HEADER",
        "TENANT_CONTEXT_REQUIRED",
        "INVALID_TENANT_CONTEXT",
        "tenantContext(exchange)",
        "MessageDigest.isEqual",
        "forwardedHttps(exchange)"
    )

    Require-Markers -Name "website gateway compatibility" -Text $gatewayText -Markers @(
        'TRUSTED_TENANT_HEADER = "X-FlipForge-Tenant-Id"',
        "validTrustedTenantId",
        "[TRUSTED_TENANT_HEADER]: tenantId",
        '"X-Forwarded-Proto": "https"',
        '"Idempotency-Key": idempotencyKey',
        "validTenantIsolation",
        'isolation.defaultAccess === "DENY"',
        "payload.data.tenantOwned === true",
        'idempotencyScope === "TENANT"',
        'opportunityOwnership === "GRANTED_ON_COMPLETION"',
        "payload.data.transactionAuthorized === false"
    )

    if ($gatewayText.Contains("X-FlipForge-User-Id")) {
        throw "Forbidden obsolete X-FlipForge-User-Id header remains in the gateway."
    }
    if ($gatewayText.Contains('header(event, "x-flipforge-tenant-id")')) {
        throw "The gateway must not trust a browser-supplied tenant header."
    }

    $secretLeak = Select-String -Path $gatewayFile -Pattern 'FLIPFORGE_API_SERVICE_TOKEN[^\r\n]{0,160}(body|jsonResponse|errorEnvelope)' -CaseSensitive:$false
    if ($secretLeak) {
        throw "The server-only service token appears in a browser-response path."
    }
    $transactionEnable = Select-String -Path $gatewayFile -Pattern 'transactionAuthorit(?:y|zed)\s*[:,]\s*true' -CaseSensitive:$false
    if ($transactionEnable) {
        throw "Forbidden enabled transaction authority marker found in the gateway."
    }

    $authorityCallCount = ((Select-String -Path $baseEvaluationFile -Pattern "evaluateAndSave" -AllMatches).Matches | Measure-Object).Count
    if ($authorityCallCount -ne 1) {
        throw "The retained authoritative adapter must contain exactly one evaluateAndSave delegation; found $authorityCallCount."
    }
}

try {
    Invoke-MavenStep -Name "Current FlipForge2 full Maven package" -Arguments @("-B", "clean", "package")

    Invoke-MavenRunner -Name "Merged tenant identity and access foundation" `
        -MainClass "com.flipforge2.saas.SaaSTenantIsolationValidationRunner"
    Invoke-MavenRunner -Name "Merged tenant-scoped projection" `
        -MainClass "com.flipforge2.saas.SaaSTenantScopedProjectionValidationRunner"
    Invoke-MavenRunner -Name "Merged tenant private HTTP read wiring" `
        -MainClass "com.flipforge2.saas.SaaSTenantHttpReadWiringValidationRunner" `
        -DisableDaemonCleanup $true
    Invoke-MavenRunner -Name "Merged tenant evaluation writes and idempotency" `
        -MainClass "com.flipforge2.saas.SaaSTenantEvaluationWriteValidationRunner" `
        -DisableDaemonCleanup $true
    Invoke-MavenRunner -Name "Retained hosted runtime readiness" `
        -MainClass "com.flipforge2.saas.SaaSHostedRuntimeValidationRunner" `
        -DisableDaemonCleanup $true
    Invoke-MavenRunner -Name "Retained complete read API coverage" `
        -MainClass "com.flipforge2.saas.SaaSReadApiCoverageValidationRunner"
    Invoke-MavenRunner -Name "Retained private HTTP transport" `
        -MainClass "com.flipforge2.saas.SaaSPrivateHttpServerValidationRunner" `
        -DisableDaemonCleanup $true
    Invoke-MavenRunner -Name "Retained authoritative read projection" `
        -MainClass "com.flipforge2.saas.SaaSApiProjectionValidationRunner"
    Invoke-MavenRunner -Name "Retained customer exposure boundary" `
        -MainClass "com.flipforge2.ui.CardSightBetaExposureValidationRunner"

    Invoke-NodeStep -Name "Gateway JavaScript syntax" -Arguments @("--check", "netlify/functions/flipforge-api.js")
    Invoke-NodeStep -Name "Gateway validation JavaScript syntax" -Arguments @("--check", "scripts/validate-saas-api-bridge.mjs")
    Invoke-NodeStep -Name "Trusted tenant gateway contracts and security" -Arguments @("scripts/validate-saas-api-bridge.mjs")
    Invoke-NodeStep -Name "Retained SaaS prototype validation" -Arguments @("saas-prototype/validate.mjs")
    Invoke-NodeStep -Name "Retained website integration build" -Arguments @("scripts/build-assets.js")

    Write-StepHeader -Name "Cross-repository tenant gateway architecture scan"
    Assert-GatewayHandoffArchitecture
    Write-Host "Cross-repository tenant gateway architecture scan: PASS"

    Write-Host ""
    Write-Host "========================================"
    Write-Host "SAAS TENANT GATEWAY HANDOFF PHASE: PASSED"
    Write-Host "Current FlipForge2 Maven package: PASS"
    Write-Host "Tenant identity and access foundation: PASS"
    Write-Host "Tenant-scoped projection: PASS"
    Write-Host "Tenant private HTTP read wiring: PASS"
    Write-Host "Tenant evaluation writes and idempotency: PASS"
    Write-Host "Hosted runtime regression: PASS"
    Write-Host "Read API coverage regression: PASS"
    Write-Host "Private HTTP transport regression: PASS"
    Write-Host "Authority projection regression: PASS"
    Write-Host "Customer exposure regression: PASS"
    Write-Host "Website gateway contracts and security: PASS"
    Write-Host "Retained website prototype and build: PASS"
    Write-Host "Cross-repository architecture scan: PASS"
    Write-Host "========================================"
} catch {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "SAAS TENANT GATEWAY HANDOFF PHASE: FAILED"
    Write-Host $_.Exception.Message
    Write-Host "========================================"
    exit 1
}
