param(
    [string]$ConfigPath = "./scripts/hosts.json",
    [double]$CanaryPercent = -1,
    [double]$ErrorThreshold = -1,
    [string]$Branch = "",
    [switch]$ForceRollback,
    [switch]$SkipCanary
)

function Load-Config {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        Write-Host "[!] Config not found at $Path — using defaults" -ForegroundColor Yellow
        return $null
    }
    $raw = Get-Content $Path -Raw | ConvertFrom-Json
    return $raw
}

function Get-ActiveHosts {
    param($Config)
    if (-not $Config -or -not $Config.hosts) { return @(@{ host = "localhost"; user = ""; label = "localhost" }) }
    return $Config.hosts | Where-Object { $_.active -eq $true }
}

function Get-CanaryHosts {
    param($Hosts, [double]$Percent)
    $total = $Hosts.Count
    $count = [Math]::Max(1, [Math]::Ceiling($total * $Percent / 100))
    return $Hosts[0..($count - 1)]
}

function Invoke-Remote {
    param($HostEntry, [string]$Command)
    if ($HostEntry.host -eq "localhost" -or $HostEntry.host -eq "127.0.0.1") {
        Invoke-Expression $Command 2>&1
        return
    }
    $sshUser = if ($HostEntry.user) { "$($HostEntry.user)@$($HostEntry.host)" } else { $HostEntry.host }
    ssh $sshUser $Command 2>&1
}

function Deploy-Host {
    param($HostEntry, [string]$BranchName, [string]$ImageTag)
    Write-Host "  → Deploying $BranchName (tag: $ImageTag) on $($HostEntry.label)..." -ForegroundColor Cyan
    $result = Invoke-Remote $HostEntry @"
cd "$PWD"
git fetch origin
git checkout $BranchName
git pull origin $BranchName
IMAGE_TAG=$ImageTag docker compose pull
IMAGE_TAG=$ImageTag docker compose up -d
"@
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Deploy failed on $($HostEntry.label)" -ForegroundColor Red
        return $false
    }
    Write-Host "  ✓ Deployed on $($HostEntry.label)" -ForegroundColor Green
    return $true
}

function Test-Health {
    param($Config)
    if (-not $Config -or -not $Config.deploy.health_endpoints) {
        $endpoints = @{
            "discovery-server" = "https://localhost:8443/ping"
            "message-manager"  = "https://localhost:8444/health"
            "financial-scraper"= "https://localhost:8445/health"
            "trader-trainer"   = "https://localhost:8446/health"
        }
    } else {
        $endpoints = $Config.deploy.health_endpoints
    }

    $results = @{}
    foreach ($svc in $endpoints.PSObject.Properties) {
        $url = $svc.Value
        try {
            $req = [System.Net.WebRequest]::Create($url)
            $req.Method = "GET"
            $req.Timeout = 10000
            if ($url -like "https://*") {
                $req.ServerCertificateValidationCallback = { $true }
            }
            $resp = $req.GetResponse()
            $statusCode = [int]$resp.StatusCode
            $resp.Close()
            $results[$svc.Name] = $statusCode -ge 200 -and $statusCode -lt 500
        } catch {
            $results[$svc.Name] = $false
        }
    }
    return $results
}

function Measure-ErrorRate {
    param($Config, [int]$Samples = 10, [int]$IntervalSec = 5)
    $errors = 0
    $total = 0
    for ($i = 0; $i -lt $Samples; $i++) {
        $health = Test-Health $Config
        foreach ($svc in $health.Keys) {
            $total++
            if (-not $health[$svc]) { $errors++ }
        }
        if ($i -lt ($Samples - 1)) { Start-Sleep -Seconds $IntervalSec }
    }
    return [double]$errors / [Math]::Max(1, $total)
}

function Wait-ForHealthy {
    param($Config, [int]$Retries, [int]$IntervalSec)
    for ($r = 1; $r -le $Retries; $r++) {
        $health = Test-Health $Config
        $unhealthy = ($health.Values | Where-Object { -not $_ }).Count
        if ($unhealthy -eq 0) { return $true }
        Write-Host "      (retry $r/$Retries — $unhealthy service(s) unhealthy)" -ForegroundColor DarkYellow
        if ($r -lt $Retries) { Start-Sleep -Seconds $IntervalSec }
    }
    return $false
}

# ── Main ──────────────────────────────────────────────────────────────────────

Write-Host "═══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Trading Model — Beta Deploy Server" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Magenta

$config = Load-Config $ConfigPath
$hosts = Get-ActiveHosts $config
$deployCfg = if ($config) { $config.deploy } else { $null }

$effPercent = if ($CanaryPercent -ge 0) { $CanaryPercent } else { if ($deployCfg) { $deployCfg.canary_percent } else { 2.0 } }
$effThreshold = if ($ErrorThreshold -ge 0) { $ErrorThreshold } else { if ($deployCfg) { $deployCfg.error_threshold } else { 0.05 } }
$effBranch = if ($Branch) { $Branch } else { if ($deployCfg) { $deployCfg.branch_dev } else { "development" } }
$stableBranch = if ($deployCfg) { $deployCfg.branch_stable } else { "main" }
$imageTagDev = if ($deployCfg) { $deployCfg.image_tag_dev } else { "latest" }
$healthRetries = if ($deployCfg) { $deployCfg.health_check_retries } else { 3 }
$healthInterval = if ($deployCfg) { $deployCfg.health_check_interval_sec } else { 10 }
$monitorMin = if ($deployCfg) { $deployCfg.monitor_duration_min } else { 30 }

Write-Host ""
Write-Host "Hosts available: $($hosts.Count) active"
Write-Host "Canary percent : $effPercent%"
Write-Host "Error threshold: $($effThreshold * 100)%"
Write-Host "Target branch : $effBranch"
Write-Host "Stable branch : $stableBranch"
Write-Host ""

# ── Force rollback mode ───────────────────────────────────────────────────────
if ($ForceRollback) {
    Write-Host "[ROLLBACK] Redeploying $stableBranch on all active hosts..." -ForegroundColor Yellow
    foreach ($h in $hosts) {
        $ok = Deploy-Host $h $stableBranch $imageTagDev
        if (-not $ok) { Write-Host "  ✗ Rollback failed on $($h.label)" -ForegroundColor Red }
    }
    Write-Host "[ROLLBACK] Done." -ForegroundColor Yellow
    exit 0
}

# ── Select canary hosts ───────────────────────────────────────────────────────
if ($SkipCanary) {
    $canaryHosts = @()
    $remainingHosts = $hosts
    Write-Host "[CANARY] Skipped — deploying to all hosts directly" -ForegroundColor DarkYellow
} else {
    $canaryHosts = Get-CanaryHosts $hosts $effPercent
    $remainingHosts = $hosts | Where-Object { $_ -notin $canaryHosts }
    Write-Host "[CANARY] $($canaryHosts.Count) host(s) selected for canary:" -ForegroundColor Cyan
    foreach ($h in $canaryHosts) { Write-Host "         - $($h.label)" }
}

# ── Phase 1: Deploy canary ────────────────────────────────────────────────────
Write-Host ""
Write-Host "═══ Phase 1: Canary deploy ═══════════════════" -ForegroundColor Cyan
$canaryOk = $true

foreach ($h in $canaryHosts) {
    $ok = Deploy-Host $h $effBranch $imageTagDev
    if (-not $ok) { $canaryOk = $false; break }
}

if (-not $canaryOk) {
    Write-Host "[!] Canary deploy failed — rolling back to $stableBranch" -ForegroundColor Red
    foreach ($h in $canaryHosts) {
        Deploy-Host $h $stableBranch $imageTagDev | Out-Null
    }
    exit 1
}

# ── Phase 2: Wait for healthy ─────────────────────────────────────────────────
Write-Host ""
Write-Host "═══ Phase 2: Health check ════════════════════" -ForegroundColor Cyan
$healthy = Wait-ForHealthy $config $healthRetries $healthInterval
if (-not $healthy) {
    Write-Host "[!] Services not healthy — rolling back to $stableBranch" -ForegroundColor Red
    foreach ($h in $canaryHosts) {
        Deploy-Host $h $stableBranch $imageTagDev | Out-Null
    }
    exit 1
}
Write-Host "  ✓ All services healthy" -ForegroundColor Green

# ── Phase 3: Monitor error rate ───────────────────────────────────────────────
Write-Host ""
Write-Host "═══ Phase 3: Monitor ($monitorMin min) ═══════" -ForegroundColor Cyan
$monitorSamples = [Math]::Max(5, $monitorMin * 2)
$sampleInterval = 30

$errorRate = Measure-ErrorRate $config $monitorSamples $sampleInterval
Write-Host "  Error rate: $([Math]::Round($errorRate * 100, 2))% (threshold: $($effThreshold * 100)%)" -ForegroundColor $(if ($errorRate -le $effThreshold) { "Green" } else { "Red" })

if ($errorRate -gt $effThreshold) {
    Write-Host "[!] Error rate exceeds threshold — rolling back to $stableBranch" -ForegroundColor Red
    foreach ($h in $canaryHosts) {
        Deploy-Host $h $stableBranch $imageTagDev | Out-Null
    }
    exit 1
}

# ── Phase 4: Deploy remaining hosts ───────────────────────────────────────────
if ($remainingHosts.Count -gt 0) {
    Write-Host ""
    Write-Host "═══ Phase 4: Full rollout ════════════════════" -ForegroundColor Cyan
    foreach ($h in $remainingHosts) {
        $ok = Deploy-Host $h $effBranch $imageTagDev
        if (-not $ok) { Write-Host "  ✗ Deploy failed on $($h.label)" -ForegroundColor Red }
    }
} else {
    Write-Host "  (no remaining hosts — canary covered all)" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Beta deploy complete!" -ForegroundColor Green
Write-Host "  Branch: $effBranch" -ForegroundColor Green
Write-Host "  Hosts : $($hosts.Count) deployed" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Magenta
