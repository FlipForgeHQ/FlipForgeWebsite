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

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $nodeCommand) {
    throw "Node.js is required to validate the FlipForge website gateway."
}

function Invoke-MavenStep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Write-Host ""
    Write-Host "========================================"
    Write-Host "RUNNING: $Name"
    Write-Host "========================================"

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

function Invoke-NodeStep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Write-Host ""
    Write-Host "========================================"
    Write-Host "RUNNING: $Name"
    Write-Host "========================================"

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

function Assert-GatewayHandoffArchitecture {
    $tenantContextFile = Join-Path $backendRoot "src/main/java/com/flipforge2/saas/SaaSTenantContext.java"
    $tenantProjectionFile = Join-Path $backendRoot "src/main/java/com/flipforge2/saas/SaaSTenantScopedProjectionService.java"
    $tenantEvaluationFile = Join-Path $backendRoot "src/main/java/com/flipforge2/saas/SaaSTenantAuthoritativeEvaluationService.java"
    $serverFile = Join-Path $backendRoot "src/main/java/com/flipforge2/saas/SaaSPrivateHttpServer.java"
    $gatewayFile = Join-Path $websiteRoot "netlify/functions/flipforge-api.js"
    $validatorFile = Join-Path $websiteRoot "scripts/validate-saas-api-bridge.mjs"
    $docsFile = Join-Path $websiteRoot "docs/SAAS_API_BRIDGE.md"

    foreach ($file in @(
        $tenantContextFile,
        $tenantProjectionFile,
        $tenantEvaluationFile,
        $serverFile,
        $gatewayFile,
        $validatorFile,
        $docsFile
    )) {
        if (-not (Test-Path $file)) {
            throw "Required gateway-handoff file is missing: $file"
        }
    }

    $tenantContextText = Get-Content $tenantContextFile -Raw
    $tenantProjectionText = Get-Content $tenantProjectionFile -Raw
    $tenantEvaluationText = Get-Content $tenantEvaluationFile -Raw
    $serverText = Get-Content $serverFile -Raw
    $gatewayText = Get-Content $gatewayFile -Raw

    foreach ($marker in @(
        'TRUSTED_HEADER = "X-FlipForge-Tenant-Id"',
        "MessageDigest.getInstance(\"SHA-256\")",
        "SAFE_ID",
        "auditKey()"
    )) {
        if (-not $tenantContextText.Contains($marker)) {
            throw "Required merged tenant-context marker is missing: $marker"
        }
    }

    foreach ($marker in @(
        'put("tenantIsolation", new JSONObject()',
        'put("enforced", true)',
        'put("defaultAccess", "DENY")',
        "isOpportunityAllowed",
        "SaaSResourceNotFoundException"
    )) {
        if (-not $tenantProjectionText.Contains($marker)) {
            throw "Required merged tenant-read marker is missing: $marker"
        }
    }

    foreach ($marker in @(
        'put("tenantOwned", true)',
        'put("idempotencyScope", "TENANT")',
        'put("opportunityOwnership", "GRANTED_ON_COMPLETION")',
        "completeAndGrant",
        'put("transactionAuthorized", false)'
    )) {
        if (-not $tenantEvaluationText.Contains($marker)) {
            throw "Required merged tenant-evaluation marker is missing: $marker"
        }
    }

    foreach ($marker in @(
        "SaaSTenantContext.TRUSTED_HEADER",
        "TENANT_CONTEXT_REQUIRED",
        "INVALID_TENANT_CONTEXT",
        "tenantContext(exchange)",
        "MessageDigest.isEqual",
        "forwardedHttps(exchange)"
    )) {
        if (-not $serverText.Contains($marker)) {
            throw "Required authoritative HTTP tenant marker is missing: $marker"
        }
    }

    foreach ($marker in @(
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
    )) {
        if (-not $gatewayText.Contains($marker)) {
            throw "Required website gateway compatibility marker is missing: $marker"
        }
    }

    $forbiddenGatewayRules = @(
        @{ Name = "obsolete tenant header"; Pattern = "X-FlipForge-User-Id" },
        @{ Name = "browser tenant-header trust"; Pattern = 'header\(event,\s*["'']x-flipforge-tenant-id["'']\)' },
        @{ Name = "service token in browser response"; Pattern = 'FLIPFORGE_API_SERVICE_TOKEN[^\r\n]{0,160}(body|jsonResponse|errorEnvelope)' },
        @{ Name = "enabled transaction authority"; Pattern = 'transactionAuthorit(?:y|zed)["'']?\s*[:,]\s*true' }
    )
    foreach ($rule in $forbiddenGatewayRules) {
        $found = Select-String -Path $gatewayFile -Pattern $rule.Pattern -CaseSensitive:$false
        if ($found) {
            $locations = ($found | ForEach-Object { "$($_.Path):$($_.LineNumber)" }) -join ", "
            throw "Forbidden $($rule.Name) marker found at $locations"
        }
    }

    $authorityCallCount = ((Select-String -Path $backendRoot/src/main/java/com/flipforge2/saas/SaaSAuthoritativeEvaluationService.java -Pattern "evaluateAndSave" -AllMatches).Matches | Measure-Object).Count
    if ($authorityCallCount -ne 1) {
        throw "The retained authoritative adapter must contain exactly one evaluateAndSave delegation; found $authorityCallCount."
    }
}

try {
    Invoke-MavenStep -Name "Current FlipForge2 full Maven package" -Arguments @(
        "-B",
        "clean",
        "package"
    )

    Invoke-MavenStep -Name "Merged tenant identity and access foundation" -Arguments @(
        "-B",
        "-Dexec.mainClass=com.flipforge2.saas.SaaSTenantIsolationValidationRunner",
        "-Dexec.classpathScope=runtime",
        "org.codehaus.mojo:exec-maven-plugin:3.5.0:java"
    )

    Invoke-MavenStep -Name "Merged tenant-scoped projection" -Arguments @(
        "-B",
        "-Dexec.mainClass=com.flipforge2.saas.SaaSTenantScopedProjectionValidationRunner",
        "-Dexec.classpathScope=runtime",
        "org.codehaus.mojo:exec-maven-plugin:3.5.0:java"
    )

    Invoke-MavenStep -Name "Merged tenant private HTTP read wiring" -Arguments @(
        "-B",
        "-Dexec.mainClass=com.flipforge2.saas.SaaSTenantHttpReadWiringValidationRunner",
        "-Dexec.classpathScope=runtime",
        "-Dexec.cleanupDaemonThreads=false",
        "org.codehaus.mojo:exec-maven-plugin:3.5.0:java"
    )

    Invoke-MavenStep -Name "Merged tenant evaluation writes and idempotency" -Arguments @(
        "-B",
        "-Dexec.mainClass=com.flipforge2.saas.SaaSTenantEvaluationWriteValidationRunner",
        "-Dexec.classpathScope=runtime",
        "-Dexec.cleanupDaemonThreads=false",
        "org.codehaus.mojo:exec-maven-plugin:3.5.0:java"
    )

    Invoke-MavenStep -Name "Retained hosted runtime readiness" -Arguments @(
        "-B",
        "-Dexec.mainClass=com.flipforge2.saas.SaaSHostedRuntimeValidationRunner",
        "-Dexec.classpathScope=runtime",
        "-Dexec.cleanupDaemonThreads=false",
        "org.codehaus.mojo:exec-maven-plugin:3.5.0:java"
    )

    Invoke-MavenStep -Name "Retained complete read API coverage" -Arguments @(
        "-B",
        "-Dexec.mainClass=com.flipforge2.saas.SaaSReadApiCoverageValidationRunner",
        "-Dexec.classpathScope=runtime",
        "org.codehaus.mojo:exec-maven-plugin:3.5.0:java"
    )

    Invoke-MavenStep -Name "Retained private HTTP transport" -Arguments @(
        "-B",
        "-Dexec.mainClass=com.flipforge2.saas.SaaSPrivateHttpServerValidationRunner",
        "-Dexec.classpathScope=runtime",
        "-Dexec.cleanupDaemonThreads=false",
        "org.codehaus.mojo:exec-maven-plugin:3.5.0:java"
    )

    Invoke-MavenStep -Name "Retained authoritative read projection" -Arguments @(
        "-B",
        "-Dexec.mainClass=com.flipforge2.saas.SaaSApiProjectionValidationRunner",
        "-Dexec.classpathScope=runtime",
        "org.codehaus.mojo:exec-maven-plugin:3.5.0:java"
    )

    Invoke-MavenStep -Name "Retained customer exposure boundary" -Arguments @(
        "-B",
        "-Dexec.mainClass=com.flipforge2.ui.CardSightBetaExposureValidationRunner",
        "-Dexec.classpathScope=runtime",
        "org.codehaus.mojo:exec-maven-plugin:3.5.0:java"
    )

    Invoke-NodeStep -Name "Gateway JavaScript syntax" -Arguments @(
        "--check",
        "netlify/functions/flipforge-api.js"
    )

    Invoke-NodeStep -Name "Gateway validation JavaScript syntax" -Arguments @(
        "--check",
        "scripts/validate-saas-api-bridge.mjs"
    )

    Invoke-NodeStep -Name "Trusted tenant gateway contracts and security" -Arguments @(
        "scripts/validate-saas-api-bridge.mjs"
    )

    Invoke-NodeStep -Name "Retained SaaS prototype validation" -Arguments @(
        "saas-prototype/validate.mjs"
    )

    Invoke-NodeStep -Name "Retained website integration build" -Arguments @(
        "scripts/build-assets.js"
    )

    Write-Host ""
    Write-Host "========================================"
    Write-Host "RUNNING: Cross-repository tenant gateway architecture scan"
    Write-Host "========================================"
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
