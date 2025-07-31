# Swagger Codegen Python Client Generator Script
# This script generates a Python client using Swagger Codegen instead of OpenAPI Generator

param(
    [string]$OutputDirectory = ".\opensilex_python_client",
    [string]$PackageName = "opensilex_swagger_client",
    [string]$ClientName = "OpenSilexClient"
)

Write-Host "Starting Swagger Codegen Python Client Generation..." -ForegroundColor Green

# Check if Swagger Codegen CLI is available
$swaggerCodegen = Get-Command "swagger-codegen" -ErrorAction SilentlyContinue
if (-not $swaggerCodegen) {
    Write-Host "Swagger Codegen CLI not found. Installing via npm..." -ForegroundColor Yellow
    
    # Check if npm is available
    $npm = Get-Command "npm" -ErrorAction SilentlyContinue
    if (-not $npm) {
        Write-Host "npm not found. Please install Node.js first: https://nodejs.org/" -ForegroundColor Red
        exit 1
    }
    
    # Install Swagger Codegen CLI globally
    Write-Host "Installing swagger-codegen-cli..." -ForegroundColor Yellow
    npm install -g swagger-codegen-cli
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install Swagger Codegen CLI" -ForegroundColor Red
        exit 1
    }
}

# Verify the OpenAPI spec file exists
$specFile = ".\openapi_spec.json"
if (-not (Test-Path $specFile)) {
    Write-Host "OpenAPI specification file not found: $specFile" -ForegroundColor Red
    Write-Host "Please ensure the openapi_spec.json file is in the current directory." -ForegroundColor Red
    exit 1
}

# Create output directory if it doesn't exist
if (-not (Test-Path $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    Write-Host "Created output directory: $OutputDirectory" -ForegroundColor Green
}

# Generate Python client using Swagger Codegen
Write-Host "Generating Python client with Swagger Codegen..." -ForegroundColor Yellow
Write-Host "  - Input: $specFile" -ForegroundColor Cyan
Write-Host "  - Output: $OutputDirectory" -ForegroundColor Cyan
Write-Host "  - Package: $PackageName" -ForegroundColor Cyan

# Try Swagger Codegen 3.x command structure first
swagger-codegen generate -i $specFile -l python -o $OutputDirectory --package-name $PackageName

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nPython client generated successfully with Swagger Codegen!" -ForegroundColor Green
    Write-Host "Location: $OutputDirectory" -ForegroundColor Green
    
    Write-Host "`nNext steps:" -ForegroundColor Yellow
    Write-Host "1. Navigate to the generated client directory:" -ForegroundColor White
    Write-Host "   cd $OutputDirectory" -ForegroundColor Cyan
    Write-Host "2. Install the client package:" -ForegroundColor White
    Write-Host "   pip install -e ." -ForegroundColor Cyan
    Write-Host "3. Use the client in your Python code:" -ForegroundColor White
    Write-Host "   import $PackageName" -ForegroundColor Cyan
    
    # Display generated structure
    Write-Host "`nGenerated client structure:" -ForegroundColor Yellow
    if (Test-Path $OutputDirectory) {
        Get-ChildItem $OutputDirectory -Directory | Select-Object -First 10 | ForEach-Object {
            Write-Host "  Folder: $($_.Name)" -ForegroundColor Cyan
        }
    }
    
    Write-Host "`nComparing with OpenAPI Generator results..." -ForegroundColor Yellow
    Write-Host "- OpenAPI Generator output: .\openapi_python_client\" -ForegroundColor White
    Write-Host "- Swagger Codegen output: $OutputDirectory\" -ForegroundColor White
    Write-Host "`nYou can now compare both clients to see which handles the validation issues better." -ForegroundColor Green
    
} else {
    Write-Host "`nSwagger Codegen generation failed. Trying alternative approach..." -ForegroundColor Yellow
    
    # Try with npx swagger-codegen-cli if the direct command failed
    Write-Host "Trying with npx swagger-codegen-cli..." -ForegroundColor Yellow
    npx swagger-codegen-cli generate -i $specFile -l python -o $OutputDirectory --package-name $PackageName
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nPython client generated successfully with npx swagger-codegen-cli!" -ForegroundColor Green
    } else {
        Write-Host "`nTrying Java-based Swagger Codegen..." -ForegroundColor Yellow
        
        # Download and use the Java JAR version
        $jarFile = "swagger-codegen-cli.jar"
        if (-not (Test-Path $jarFile)) {
            Write-Host "Downloading Swagger Codegen JAR..." -ForegroundColor Yellow
            Invoke-WebRequest -Uri "https://repo1.maven.org/maven2/io/swagger/codegen/v3/swagger-codegen-cli/3.0.46/swagger-codegen-cli-3.0.46.jar" -OutFile $jarFile
        }
        
        if (Test-Path $jarFile) {
            Write-Host "Using Java-based Swagger Codegen..." -ForegroundColor Yellow
            java -jar $jarFile generate -i $specFile -l python -o $OutputDirectory --package-name $PackageName
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "`nPython client generated successfully with Java Swagger Codegen!" -ForegroundColor Green
            } else {
                Write-Host "`nAll Swagger Codegen attempts failed!" -ForegroundColor Red
                Write-Host "The OpenAPI specification may have issues that both generators struggle with." -ForegroundColor Red
                exit 1
            }
        } else {
            Write-Host "`nFailed to download Swagger Codegen JAR!" -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host "`nGeneration completed!" -ForegroundColor Green