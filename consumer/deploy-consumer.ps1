<#
.SYNOPSIS
    Package and deploy lambda_function.py to the eval-consumer Lambda.

.DESCRIPTION
    Installs the dependencies from requirements.txt (the elasticsearch client)
    into a build directory, adds lambda_function.py alongside them, zips the
    package contents, and pushes it to the Lambda with aws lambda
    update-function-code, then waits for the update to finish. Finally verifies
    the function has the ELASTIC_CLOUD_ID / ELASTIC_API_KEY env vars set.

    Requires the AWS CLI v2 (configured with credentials that can update the
    function in the target region) and pip on PATH.

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
$requirements = Join-Path $scriptDir "requirements.txt"
$build = Join-Path $env:TEMP "$FunctionName-build"
$zip = Join-Path $env:TEMP "$FunctionName.zip"

if (-not (Test-Path $source)) {
    throw "Cannot find $source"
}

# Fresh build dir each run so stale deps never linger.
if (Test-Path $build) { Remove-Item $build -Recurse -Force }
New-Item -ItemType Directory -Path $build | Out-Null

Write-Host "Installing dependencies into $build ..."
# Invoke pip via the venv's python.exe (-m pip) rather than running pip.exe
# directly: the Application Control policy on this machine blocks the unsigned
# pip.exe shim in the user-writable .venv, but allows python.exe.
$venvPython = Join-Path (Join-Path (Join-Path (Join-Path $PSScriptRoot '..') '.venv') 'Scripts') 'python.exe'
& $venvPython -m pip install -r $requirements --target $build
if ($LASTEXITCODE -ne 0) { throw "pip install failed (exit $LASTEXITCODE)" }

Write-Host "Adding handler ..."
Copy-Item $source -Destination $build

Write-Host "Packaging $zip ..."
if (Test-Path $zip) { Remove-Item $zip -Force }
# Trailing \* zips the CONTENTS so files sit at the zip ROOT (lambda_function.py
# + elasticsearch/ ...) rather than nested under the build folder, which is what
# the Lambda runtime needs to find the handler.
Compress-Archive -Path (Join-Path $build "*") -DestinationPath $zip -Force

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

# The handler reads these from its environment; warn (don't set) if missing so
# the secret API key never has to live in this script or the repo.
$envJson = aws lambda get-function-configuration `
    --function-name $FunctionName `
    --region $Region `
    --query "Environment.Variables" `
    --output json
if ($envJson -notmatch "ELASTIC_CLOUD_ID" -or $envJson -notmatch "ELASTIC_API_KEY") {
    Write-Warning "Lambda is missing ELASTIC_CLOUD_ID / ELASTIC_API_KEY; set them before invoking."
}

# Clean up the build dir.
Remove-Item $build -Recurse -Force
