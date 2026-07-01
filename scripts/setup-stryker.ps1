$workspaces = @(
    @{ dir = "packages\common"; name = "@trading-model/common" },
    @{ dir = "packages\address-manager"; name = "@trading-model/address-manager" },
    @{ dir = "packages\broker-message"; name = "@trading-model/broker-message" },
    @{ dir = "packages\certificate-client"; name = "@trading-model/certificate-client" },
    @{ dir = "packages\certificate-utils"; name = "@trading-model/certificate-utils" },
    @{ dir = "services\discovery-server"; name = "discovery-server" },
    @{ dir = "services\message-manager"; name = "message-manager" },
    @{ dir = "services\certificate-authority"; name = "certificate-authority" },
    @{ dir = "services\dlq-service"; name = "dlq-service" },
    @{ dir = "services\financial-scraper"; name = "financial-scraper" },
    @{ dir = "services\audit-logger"; name = "audit-logger" },
    @{ dir = "services\api-gateway"; name = "api-gateway" },
    @{ dir = "services\trader-trainer"; name = "trader-service" }
)

foreach ($ws in $workspaces) {
    $fullPath = Join-Path "C:\Users\doc\Documents\GitHub\tmp\trading-model" $ws.dir
    $configPath = Join-Path $fullPath "stryker.config.json"
    $pkgPath = Join-Path $fullPath "package.json"

    # Create stryker config if it doesn't exist
    if (-not (Test-Path $configPath)) {
        $config = @{
            '$schema' = "../../node_modules/@stryker-mutator/core/schema/stryker-schema.json"
            mutate = @("src/**/*.ts", "!src/**/*.d.ts")
            testRunner = "jest"
            jest = @{ configFile = "jest.config.js" }
            checkers = @("typescript")
            tsconfigFile = "tsconfig.json"
            concurrency = 4
            coverageAnalysis = "perTest"
            reporters = @("clear-text", "progress")
            tempDirName = "stryker-tmp"
            cleanTempDir = $true
            thresholds = @{ high = 80; low = 60; break = $null }
        }

        # trader-trainer uses jest.config.ts
        if ($ws.dir -eq "services\trader-trainer") {
            $config.jest.configFile = "jest.config.ts"
        }

        # certificate workspaces need serial execution
        if ($ws.dir -match "certificate") {
            $config.concurrency = 1
        }

        $config | ConvertTo-Json -Depth 4 | Set-Content $configPath
        Write-Host "Created: $configPath"
    }

    # Add stryker script to package.json
    if (Test-Path $pkgPath) {
        $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
        if (-not $pkg.scripts.stryker) {
            $pkg.scripts | Add-Member -MemberType NoteProperty -Name "stryker" -Value "stryker run" -Force
            $pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath
            Write-Host "Updated: $pkgPath (added stryker script)"
        }
    }
}
