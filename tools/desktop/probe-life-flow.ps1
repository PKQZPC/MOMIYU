param(
 [Parameter(Mandatory=$true)][string]$ProxyConfig,
 [string]$ProxyExecutable,
 [switch]$AllowModelCalls,
 [switch]$Continue
)
$ErrorActionPreference='Stop'
if(-not $AllowModelCalls){throw 'This live probe can make up to six model requests. Specify -AllowModelCalls explicitly; use run-offline-demo.cjs for an offline walkthrough.'}
$workspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $workspace 'tools/desktop/project-paths.ps1')
$out=New-ProjectDirectory $workspace (Join-Path $workspace '.local/life-flow-probe')
$env:TEMP=New-ProjectDirectory $workspace (Join-Path $out 'tmp');$env:TMP=$env:TEMP
$ProxyConfig=(Resolve-Path -LiteralPath $ProxyConfig).Path
Push-Location $workspace
$proxy=$null;$exitCode=1
try{
 $portText=& node -e 'const c=require("./services/local-runtime/src/model.cjs").readProxyConfig(process.argv[1]);console.log(new URL(c.baseURL).port)' $ProxyConfig
 if($LASTEXITCODE -ne 0){throw 'Invalid loopback proxy configuration'}
 $portNumber=[int]$portText
 if($ProxyExecutable){
  $ProxyExecutable=(Resolve-Path -LiteralPath $ProxyExecutable).Path
  if(-not $ProxyExecutable.StartsWith($workspace+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Keep managed proxy executables inside the project'}
  if(Get-NetTCPConnection -LocalPort $portNumber -State Listen -ErrorAction SilentlyContinue){throw 'A proxy already owns this port; omit -ProxyExecutable to use it'}
  # Use one credential source. Never copy auth files or rewrite auth-dir.
  $proxy=Start-Process -FilePath $ProxyExecutable -ArgumentList @('-config',('"'+$ProxyConfig+'"')) -WorkingDirectory $out -WindowStyle Hidden -RedirectStandardOutput (Join-Path $out 'proxy-stdout.log') -RedirectStandardError (Join-Path $out 'proxy-stderr.log') -PassThru
  for($i=0;$i -lt 40;$i++){if(Get-NetTCPConnection -LocalPort $portNumber -State Listen -ErrorAction SilentlyContinue){break};Start-Sleep -Milliseconds 250}
 }
 if($Continue){& node (Join-Path $PSScriptRoot 'probe-life-flow.cjs') --run --proxy-config $ProxyConfig --continue}else{& node (Join-Path $PSScriptRoot 'probe-life-flow.cjs') --run --proxy-config $ProxyConfig}
 $exitCode=$LASTEXITCODE
}finally{
 if($proxy -and !$proxy.HasExited){Stop-Process -Id $proxy.Id;$proxy.WaitForExit()}
 @{owned_process_closed=(!$proxy -or $proxy.HasExited);configured_port=$portNumber;checked_at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $out 'proxy-shutdown.json') -Encoding utf8
 Pop-Location
}
exit $exitCode
