param(
  [switch]$ApplyForwardMigrations,
  [switch]$ExcludeTenantDataSeeds,
  [switch]$RunConcurrencyProbes,
  [string[]]$PostMigrationVerification = @()
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (($RunConcurrencyProbes -or $PostMigrationVerification.Count -gt 0) -and -not $ApplyForwardMigrations) {
  throw 'Post-migration probes require -ApplyForwardMigrations.'
}

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$baselineCutoff = '20260813091000'
$baselineDirectory = Join-Path $repositoryRoot "supabase\baselines\$baselineCutoff"
$cli = Join-Path $repositoryRoot 'node_modules\.bin\supabase.cmd'
$postgresImage = 'public.ecr.aws/supabase/postgres:17.6.1.031'
$projectId = "zelopdv-baseline-$([guid]::NewGuid().ToString('N').Substring(0, 10))"
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) $projectId
$temporarySupabase = Join-Path $temporaryRoot 'supabase'
$started = $false

function Invoke-SupabaseLocal {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  $forbidden = @('--linked', '--db-url', '--password')
  foreach ($argument in $Arguments) {
    if ($forbidden -contains $argument) {
      throw "Remote-capable Supabase option is forbidden by this harness: $argument"
    }
  }

  & $cli @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase CLI failed: $($Arguments -join ' ')"
  }
}

function Invoke-DisposablePsql {
  param(
    [Parameter(Mandatory = $true)][string]$DatabaseUrl,
    [Parameter(Mandatory = $true)][ValidateSet('schema.sql', 'platform.sql')][string]$File,
    [switch]$SingleTransaction
  )

  if ($DatabaseUrl -notmatch '^postgresql://postgres:postgres@127\.0\.0\.1:55322/postgres$') {
    throw 'Refusing a non-loopback or unexpected database target.'
  }

  $arguments = @(
    'run', '--rm', '--network', 'host',
    '-v', "${baselineDirectory}:/baseline:ro",
    $postgresImage,
    'psql', $DatabaseUrl, '-X', '-q', '-v', 'ON_ERROR_STOP=1',
    '-v', 'zelo_disposable_baseline=1'
  )
  if ($SingleTransaction) { $arguments += '--single-transaction' }
  $arguments += @('--file', "/baseline/$File")

  & docker @arguments
  if ($LASTEXITCODE -ne 0) { throw "Baseline SQL failed: $File" }
}

function Invoke-DisposableVerificationPsql {
  param(
    [Parameter(Mandatory = $true)][string]$DatabaseUrl,
    [Parameter(Mandatory = $true)][string]$File
  )

  if ($DatabaseUrl -notmatch '^postgresql://postgres:postgres@127\.0\.0\.1:55322/postgres$') {
    throw 'Refusing a non-loopback or unexpected database target.'
  }

  $verificationRoot = (Resolve-Path -LiteralPath (Join-Path $repositoryRoot 'supabase\verification')).Path
  $resolvedFile = (Resolve-Path -LiteralPath (Join-Path $repositoryRoot $File)).Path
  if (-not $resolvedFile.StartsWith("$verificationRoot\", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Post-migration verification must stay under supabase/verification: $File"
  }

  $containerFile = "/verification/$([IO.Path]::GetFileName($resolvedFile))"
  & docker run --rm --network host `
    -v "${verificationRoot}:/verification:ro" `
    $postgresImage `
    psql $DatabaseUrl -X -q -v ON_ERROR_STOP=1 --file $containerFile
  if ($LASTEXITCODE -ne 0) { throw "Post-migration verification failed: $File" }
}

function Get-NormalizedDumpHash {
  param([Parameter(Mandatory = $true)][string]$File)

  $content = (Get-Content -LiteralPath $File -Raw).Replace("`r`n", "`n")
  $start = $content.IndexOf('SET statement_timeout = 0;')
  if ($start -lt 0) { throw "Could not locate stable pg_dump body in $File" }
  $content = $content.Substring($start)
  $content = [regex]::Replace($content, '(?m)^\\(?:un)?restrict .+\n', '')
  $content = [regex]::Replace($content, '\n{3,}', "`n`n").Trim() + "`n"
  $bytes = [Text.Encoding]::UTF8.GetBytes($content)
  $hasher = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($hasher.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $hasher.Dispose()
  }
}

try {
  if (-not (Test-Path -LiteralPath $cli)) { throw 'Repository-pinned Supabase CLI is missing.' }
  if (Test-Path -LiteralPath $temporaryRoot) { throw "Unexpected existing temp path: $temporaryRoot" }

  New-Item -ItemType Directory -Path $temporarySupabase -Force | Out-Null
  $config = Get-Content -LiteralPath (Join-Path $repositoryRoot 'supabase\config.toml') -Raw
  # The repository config may enable migration replay for linked work; the
  # guarantee this harness owns is that replay happens only against the
  # disposable loopback database below, never against the linked project.
  if ($config -notmatch '(?ms)^\[db\.migrations\]\s*\r?\nenabled = (?:false|true)(?:\r?\n|$)') {
    throw 'Harness config must declare an explicit [db.migrations] enabled flag.'
  }
  $config = $config.Replace('project_id = "zelopdv-local"', "project_id = `"$projectId`"")
  [IO.File]::WriteAllText(
    (Join-Path $temporarySupabase 'config.toml'),
    $config,
    [Text.UTF8Encoding]::new($false)
  )

  Invoke-SupabaseLocal start --workdir $temporaryRoot --exclude `
    'edge-runtime,gotrue,imgproxy,kong,logflare,mailpit,postgres-meta,postgrest,realtime,storage-api,studio,supavisor,vector' `
    --output-format json | Out-Null
  $started = $true

  $databaseUrl = 'postgresql://postgres:postgres@127.0.0.1:55322/postgres'

  Invoke-DisposablePsql -DatabaseUrl $databaseUrl -File 'schema.sql' -SingleTransaction
  Invoke-DisposablePsql -DatabaseUrl $databaseUrl -File 'platform.sql'

  $temporaryMigrations = Join-Path $temporarySupabase 'migrations'
  New-Item -ItemType Directory -Path $temporaryMigrations -Force | Out-Null
  # A customer-specific data seed intentionally requires a real customer row.
  # It is not schema and must not manufacture that customer in a disposable DB.
  $excludedSeed = '20260824012356_fullbuster_burger_catalog.sql'
  if ($ExcludeTenantDataSeeds) {
    $seedPath = Join-Path $repositoryRoot "supabase\migrations\$excludedSeed"
    if ((Get-FileHash -LiteralPath $seedPath -Algorithm SHA256).Hash -ne '3695D8546BCEFF1D399536FB1E2E070D5B22D61B24D719E41295F6F5E45DE318') {
      throw 'Tenant seed changed; review the disposable exclusion before continuing.'
    }
    Write-Output "DISPOSABLE_DATA_SEED_EXCLUDED $excludedSeed (schema and all other migrations remain required)"
  }
  Get-ChildItem -LiteralPath (Join-Path $repositoryRoot 'supabase\migrations') -File -Filter '*.sql' |
    Where-Object { -not $ExcludeTenantDataSeeds -or $_.Name -ne $excludedSeed } |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $temporaryMigrations $_.Name) }

  $temporaryConfigPath = Join-Path $temporarySupabase 'config.toml'
  $originalTemporaryConfig = Get-Content -LiteralPath $temporaryConfigPath -Raw
  $temporaryConfig = [regex]::Replace(
    $originalTemporaryConfig,
    '(?ms)(\[db\.migrations\]\s*\r?\n)enabled = (?:false|true)',
    '${1}enabled = true'
  )
  $migrationsEnabled = [regex]::IsMatch(
    $temporaryConfig,
    '(?ms)^\[db\.migrations\]\s*\r?\nenabled = true(?:\r?\n|$)'
  )
  if (-not $migrationsEnabled) {
    throw 'Failed to enable migrations in the disposable workdir.'
  }
  [IO.File]::WriteAllText($temporaryConfigPath, $temporaryConfig, [Text.UTF8Encoding]::new($false))

  $versions = Get-Content -LiteralPath (Join-Path $baselineDirectory 'applied-versions.txt') |
    Where-Object { $_ -and -not $_.StartsWith('#') }
  Invoke-SupabaseLocal migration repair @versions --status applied --local --workdir $temporaryRoot
  Invoke-SupabaseLocal db push --local --dry-run --workdir $temporaryRoot
  Invoke-SupabaseLocal migration list --local --workdir $temporaryRoot

  $localDump = Join-Path $temporaryRoot 'local-public.sql'
  Invoke-SupabaseLocal db dump --local --schema public --file $localDump --workdir $temporaryRoot
  $expectedDumpHash = Get-NormalizedDumpHash (Join-Path $baselineDirectory 'schema.sql')
  $actualDumpHash = Get-NormalizedDumpHash $localDump
  if ($actualDumpHash -ne $expectedDumpHash) {
    throw "Public schema/security dump differs: expected $expectedDumpHash, got $actualDumpHash"
  }

  $platformQuery = Join-Path $repositoryRoot 'supabase\verification\capture_platform_state.sql'
  $localPlatformRaw = Join-Path $temporaryRoot 'local-platform.json'
  & $cli db query --local --workdir $temporaryRoot --file $platformQuery --output-format json |
    Set-Content -LiteralPath $localPlatformRaw -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw 'Local platform-state capture failed.' }
  & node (Join-Path $repositoryRoot 'scripts\compare-platform-state.mjs') `
    $localPlatformRaw `
    (Join-Path $baselineDirectory 'platform-state.json')
  if ($LASTEXITCODE -ne 0) { throw 'Captured platform configuration differs from production.' }

  $lintOutput = Join-Path $temporaryRoot 'db-lint.json'
  & $cli db lint --local --level error --workdir $temporaryRoot --output-format json |
    Set-Content -LiteralPath $lintOutput -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw 'Local database lint command failed.' }

  if ($ApplyForwardMigrations) {
    Invoke-SupabaseLocal db push --local --yes --workdir $temporaryRoot

    foreach ($verificationFile in $PostMigrationVerification) {
      Invoke-DisposableVerificationPsql `
        -DatabaseUrl $databaseUrl `
        -File $verificationFile
    }
    if ($RunConcurrencyProbes) {
      $probeImage = 'zelopdv-disposable-verifier:node24'
      & docker build -t $probeImage (Join-Path $PSScriptRoot 'verification')
      if ($LASTEXITCODE -ne 0) { throw 'Failed to build the isolated concurrency verifier.' }
      foreach ($probe in @('verify-customer-identity-concurrency.mjs', 'verify-whatsapp-confirmation-concurrency.mjs', 'verify-sale-owner-concurrency.mjs')) {
        & docker run --rm --network host `
          -v "${PSScriptRoot}:/work/scripts:ro" `
          -v "${repositoryRoot}/supabase/verification:/work/supabase/verification:ro" `
          -e "SUPABASE_DB_URL=$databaseUrl" `
          -e "ZELOPDV_DISPOSABLE_DB_URL=$databaseUrl" `
          -e 'ZELOPDV_RUN_WHATSAPP_CONFIRMATION_CONCURRENCY=1' `
          $probeImage node "/work/scripts/$probe"
        if ($LASTEXITCODE -ne 0) { throw "Concurrency verifier failed: $probe" }
      }
    }
  } elseif ($PostMigrationVerification.Count -gt 0) {
    throw 'PostMigrationVerification requires ApplyForwardMigrations.'
  }

  Write-Output "BASELINE_VERIFIED cutoff=$baselineCutoff normalized_dump_sha256=$actualDumpHash"
  Write-Output 'Application schema/security and captured platform configuration match production.'
  if ($ApplyForwardMigrations) {
    Write-Output "Forward migrations applied locally; tenant-data exclusion=$ExcludeTenantDataSeeds; post-migration verifiers passed: $($PostMigrationVerification.Count)."
  }
  Write-Output "Lint evidence: $lintOutput"
} finally {
  if ($started) {
    & $cli stop --workdir $temporaryRoot --no-backup | Out-Null
  }
}
