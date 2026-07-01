param(
    [string]$BackupDir = "./backups",
    [string[]]$Components = @("mongodb", "mysql", "redis"),
    [switch]$DryRun
)

$Timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"

function Write-Status {
    param([string]$Message, [string]$Color = "Green")
    Write-Host "[$((Get-Date -Format 'HH:mm:ss'))] $Message" -ForegroundColor $Color
}

function Backup-MongoDB {
    Write-Status "Starting MongoDB backup..." -Color Cyan
    $BackupPath = Join-Path $BackupDir "mongodb/$Timestamp"
    
    if ($DryRun) {
        Write-Status "[DRY-RUN] Would run: docker exec trading-mongodb-primary mongodump --oplog --gzip --out=/backups/$Timestamp" -Color Yellow
        return
    }

    New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null

    $Containers = @("trading-mongodb-primary", "trading-mongodb-dlq")
    foreach ($Container in $Containers) {
        $Exists = docker ps --filter "name=$Container" --format "{{.Names}}" 2>$null
        if (-not $Exists) {
            Write-Status "Container $Container not running, skipping" -Color DarkYellow
            continue
        }
        $Dest = Join-Path $BackupPath $Container
        New-Item -ItemType Directory -Path $Dest -Force | Out-Null
        docker exec $Container mongodump --gzip --oplog --out="/tmp/backup_$Timestamp" 2>$null
        if ($LASTEXITCODE -eq 0) {
            docker cp "$Container:/tmp/backup_$Timestamp/." $Dest 2>$null
            docker exec $Container rm -rf "/tmp/backup_$Timestamp" 2>$null
            Write-Status "  ✓ MongoDB backup complete: $Container" -Color Green
        } else {
            Write-Status "  ✗ MongoDB backup failed: $Container" -Color Red
        }
    }
}

function Backup-MySQL {
    Write-Status "Starting MySQL backup..." -Color Cyan
    $BackupPath = Join-Path $BackupDir "mysql"
    New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null
    $BackupFile = Join-Path $BackupPath "financial_scraper_$Timestamp.sql.gz"

    $Container = docker ps --filter "name=trading-mysql" --format "{{.Names}}" 2>$null
    if (-not $Container) {
        Write-Status "MySQL container not running, skipping" -Color DarkYellow
        return
    }

    if ($DryRun) {
        Write-Status "[DRY-RUN] Would run: docker exec trading-mysql mysqldump --all-databases --single-transaction | gzip > $BackupFile" -Color Yellow
        return
    }

    docker exec trading-mysql mysqldump `
        --user=root --password=$env:MYSQL_ROOT_PASSWORD `
        --all-databases --single-transaction --quick --lock-tables=false 2>$null |
        Set-Content -Path $BackupFile -NoNewline

    if ($LASTEXITCODE -eq 0 -and (Test-Path $BackupFile)) {
        Write-Status "  ✓ MySQL backup complete: $BackupFile" -Color Green
    } else {
        Write-Status "  ✗ MySQL backup failed" -Color Red
    }
}

function Backup-Redis {
    Write-Status "Starting Redis backup..." -Color Cyan
    $BackupPath = Join-Path $BackupDir "redis"
    New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null
    $BackupFile = Join-Path $BackupPath "dump_$Timestamp.rdb"

    $Containers = docker ps --filter "name=trading-redis" --format "{{.Names}}" 2>$null
    if (-not $Containers) {
        Write-Status "Redis containers not running, skipping" -Color DarkYellow
        return
    }

    if ($DryRun) {
        Write-Status "[DRY-RUN] Would run: redis-cli SAVE on each Redis container, copy dump.rdb" -Color Yellow
        return
    }

    foreach ($Container in $Containers) {
        docker exec $Container redis-cli BGSAVE 2>$null
        Start-Sleep -Seconds 2
        if ($LASTEXITCODE -eq 0) {
            $Dest = Join-Path $BackupPath "$Container`_$Timestamp.rdb"
            docker cp "$Container:/data/dump.rdb" $Dest 2>$null
            Write-Status "  ✓ Redis backup complete: $Container" -Color Green
        } else {
            Write-Status "  ✗ Redis backup failed: $Container" -Color Red
        }
    }
}

function Prune-OldBackups {
    param([int]$RetentionDays = 30)
    Write-Status "Pruning backups older than $RetentionDays days..." -Color DarkYellow
    $Cutoff = (Get-Date).AddDays(-$RetentionDays)
    
    Get-ChildItem -Path $BackupDir -Recurse -Directory | Where-Object {
        $_.LastWriteTime -lt $Cutoff
    } | ForEach-Object {
        Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        Write-Status "  Removed old backup: $($_.FullName)" -Color DarkYellow
    }
}

# ── Main ──────────────────────────────────────────────────────────────────────

Write-Status "═══════════════════════════════════════════" -Color Magenta
Write-Status "  Trading Model — Database Backup" -Color Magenta
Write-Status "  Timestamp: $Timestamp" -Color Magenta
Write-Status "  Backup Dir: $BackupDir" -Color Magenta
Write-Status "═══════════════════════════════════════════" -Color Magenta
Write-Status ""

foreach ($Component in $Components) {
    switch ($Component) {
        "mongodb" { Backup-MongoDB }
        "mysql" { Backup-MySQL }
        "redis" { Backup-Redis }
        default { Write-Status "Unknown component: $Component" -Color Red }
    }
}

Prune-OldBackups

Write-Status ""
Write-Status "═══════════════════════════════════════════" -Color Magenta
Write-Status "  Backup complete!" -Color Green
Write-Status "  Location: $BackupDir" -Color Green
Write-Status "═══════════════════════════════════════════" -Color Magenta
