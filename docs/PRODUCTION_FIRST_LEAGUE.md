# One-time first-league initialization on Prisma Postgres

**Prerequisite:** migration status shows **all five** approved migrations successful.
This is for the owner's newly created empty John Scott Dynasty database only.
It is **not** a production reset, live-data sync or replay of old league results.

## Safety properties
- Production bootstrap is a **different command** from `npm run prisma:seed`.
- Explicitly requires `JSD_BOOTSTRAP_CONFIRM=INITIALIZE_NEW_EMPTY_JOHN_SCOTT_LEAGUE`.
- The bootstrap refuses any application data in any of 23 model tables and refuses incomplete or unexpected migration history.
- It generates 12 distinct random four-digit manager PINs and stores only salted scrypt hashes in PostgreSQL.
- Plain PINs are written once to `.local-bootstrap-credentials/manager-pins.json` with restrictive creation permissions. This directory is excluded from Git. Do **not** paste, screenshot or upload it.
- PINs are 4 digits because the current sign-in UI requires that format; this is inherently low entropy, so database-backed login rate limiting is essential.
- Existing demo fixture data supplies the initial team names and rosters. This is **starting test league data**, not a reconstruction of NHL history or official standings.
- The new database must be **production only** during initial setup; avoid preview writes to the same database.
- The command is never called by Vercel build, deployment, cron, or migrations.

## Before initializing
1. Verify the correct Prisma Postgres database and owner account in the Prisma console.
2. Revoke any connection credential that was posted or otherwise exposed; reconnect the Vercel integration if required.
3. In PowerShell, check out the exact reviewed bootstrap branch and run `npm ci`.
4. Inspect current schema with `npx prisma migrate status`, and read `node scripts/migration-preflight.mjs`. The latter must report `HISTORY_READY`, and all model tables must be empty.
5. Confirm nobody else is running a seed/bootstrap/sync against this database.

## Run on your laptop (never in CI against production)
Enter the **new direct Postgres URL** at the secure prompt, not in the `Read-Host` command.

```powershell
$secureUrl = Read-Host "Paste NEW DIRECT PostgreSQL URL" -AsSecureString
try {
    $env:DATABASE_URL = [System.Net.NetworkCredential]::new("", $secureUrl).Password.Trim().Trim('"', "'")
    if ($env:DATABASE_URL -notmatch '^postgres(ql)?://') { throw "Invalid direct URL" }
    $env:JSD_BOOTSTRAP_CONFIRM = "INITIALIZE_NEW_EMPTY_JOHN_SCOTT_LEAGUE"
    node scripts/migration-preflight.mjs
    if ($LASTEXITCODE -ne 0) { throw "Read-only preflight failed" }
    npm run prisma:bootstrap-production
    if ($LASTEXITCODE -ne 0) { throw "Production bootstrap failed: stop; do not rerun against partial data" }
}
finally {
    Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:\JSD_BOOTSTRAP_CONFIRM -ErrorAction SilentlyContinue
    $secureUrl = $null
}
```

If successful, immediately secure the local file containing the 12 initial manager PINs. Distribute them privately to the intended test managers and delete the plaintext file when no longer needed. The commissioner belongs to Montreal Monarchs with handle `commissioner`. Do not use a common `1234` PIN in production.

## Verify (read only)
On the same direct database:
- Migration status: all five applied
- Exactly 1 league, 12 teams, 12 managers, non-zero roster and matchup counts
- No plain PIN storage; each `User.pin` starts with `scrypt$`
- Review generated roster and draft assets before turning on live cron synchronization.

## Failure behavior
The bootstrap is strictly first-use, not idempotent. If it fails partway, it will refuse to re-run because some tables will be populated. **Do not delete data or bypass the guard.** Diagnose and recover explicitly before retrying. A locally written credentials file may exist even if initialization fails.
