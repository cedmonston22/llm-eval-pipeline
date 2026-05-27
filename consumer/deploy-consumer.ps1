<#
.SYNOPSIS
    Package and deploy lambda_function.py to the eval-consumer Lambda.

.DESCRIPTION
    Zips lambda_function.py (the only file in the deployment package — the
    handler uses just the standard library) and pushes it to the Lambda with
    aws lambda update-function-code, then waits for the update to finish.

    Requires the AWS CLI v2, configured with credentials that can update the
    function in the target region.

.EXAMPLE
    .\deploy-consumer.ps1
#>

[CmdletBinding()]
param(
    [string]$FunctionName = "eval-consumer",
    [string]$Region = "us-east-2"
)

$ErrorActionPreference = "Stop"

# Resolve paths relative to this script so it works from any cwd.
$scriptDir = $PSScriptRoot
$source = Join-Path $scriptDir "lambda_function.py"
$zip = Join-Path $env:TEMP "$FunctionName.zip"

if (-not (Test-Path $source)) {
    throw "Cannot find $source"
}

Write-Host "Packaging $source ..."
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $source -DestinationPath $zip -Force

Write-Host "Deploying to '$FunctionName' in $Region ..."
aws lambda update-function-code `
    --function-name $FunctionName `
    --region $Region `
    --zip-file "fileb://$zip" `
    --output json
if ($LASTEXITCODE -ne 0) { throw "update-function-code failed (exit $LASTEXITCODE)" }

Write-Host "Waiting for update to complete ..."
aws lambda wait function-updated --function-name $FunctionName --region $Region
if ($LASTEXITCODE -ne 0) { throw "function-updated wait failed (exit $LASTEXITCODE)" }

$status = aws lambda get-function-configuration `
    --function-name $FunctionName `
    --region $Region `
    --query "LastUpdateStatus" `
    --output text
Write-Host "Done. LastUpdateStatus: $status"
