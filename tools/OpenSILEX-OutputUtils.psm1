# OpenSILEX Output and Logging Utilities Module
# PowerShell module for colored console output and logging

# Colors for output
$script:Red = "Red"
$script:Green = "Green"
$script:Yellow = "Yellow"
$script:Blue = "Cyan"
$script:White = "White"

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = $script:White,
        [string]$Prefix = ""
    )
    
    $timestamp = Get-Date -Format "HH:mm:ss"
    if ($Prefix) {
        Write-Host "[$timestamp] [$Prefix] $Message" -ForegroundColor $Color
    } else {
        Write-Host "[$timestamp] $Message" -ForegroundColor $Color
    }
}

function Write-Success { 
    param([string]$Message) 
    Write-ColorOutput $Message $script:Green "SUCCESS" 
}

function Write-Info { 
    param([string]$Message) 
    Write-ColorOutput $Message $script:Blue "INFO" 
}

function Write-Warning { 
    param([string]$Message) 
    Write-ColorOutput $Message $script:Yellow "WARNING" 
}

function Write-Error { 
    param([string]$Message) 
    Write-ColorOutput $Message $script:Red "ERROR" 
}

# Export functions
Export-ModuleMember -Function Write-ColorOutput, Write-Success, Write-Info, Write-Warning, Write-Error