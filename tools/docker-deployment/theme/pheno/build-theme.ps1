<#
.SYNOPSIS
    Build PheNo theme CSS from SCSS source files

.DESCRIPTION
    Compiles theme.scss to main.css using SASS compiler.
    This ensures reproducibility and modularity of the theme.

.EXAMPLE
    .\build-theme.ps1
    Compile PheNo theme CSS

.NOTES
    Prerequisites: SASS compiler (npm install -g sass)
#>

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  PheNo Theme Build" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check for SASS compiler
$sassCmd = Get-Command sass -ErrorAction SilentlyContinue
if (-not $sassCmd) {
    Write-Error "SASS compiler not found. Install with: npm install -g sass"
    exit 1
}

Write-Host "[1/3] Verifying SCSS source files..." -ForegroundColor Yellow

# Check for required SCSS files
$requiredScss = @(
    "_settings.scss",
    "theme.scss"
)

foreach ($file in $requiredScss) {
    $path = Join-Path $ScriptDir $file
    if (-not (Test-Path $path)) {
        Write-Error "Required SCSS file missing: $file"
        exit 1
    }
}

Write-Host "  [OK] All SCSS source files present" -ForegroundColor Green
Write-Host ""

# Compile SCSS to CSS
Write-Host "[2/3] Compiling theme.scss to main.css..." -ForegroundColor Yellow

$themeScss = Join-Path $ScriptDir "theme.scss"
$mainCss = Join-Path $ScriptDir "main.css"

# Compile with compressed output style
& sass --style=compressed --no-source-map $themeScss $mainCss 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Error "SASS compilation failed"
    exit 1
}

Write-Host "  [OK] Compiled main.css ($(((Get-Item $mainCss).Length / 1KB).ToString('0.0')) KB)" -ForegroundColor Green
Write-Host ""

# Verify output
Write-Host "[3/3] Verifying compiled CSS..." -ForegroundColor Yellow

# Check that PheNo colors are in the compiled CSS
$cssContent = Get-Content $mainCss -Raw
$phenoColors = @("#264030", "#3D8526", "#87CF82")
$missingColors = @()

foreach ($color in $phenoColors) {
    if ($cssContent -notlike "*$color*") {
        $missingColors += $color
    }
}

if ($missingColors.Count -gt 0) {
    Write-Warning "Some PheNo colors not found in compiled CSS: $($missingColors -join ', ')"
} else {
    Write-Host "  [OK] PheNo colors verified in CSS" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Theme Build Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Output: $mainCss" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Review the compiled CSS" -ForegroundColor Gray
Write-Host "  2. Run ..\04-apply-theme.ps1 to deploy to server" -ForegroundColor Gray
Write-Host ""
