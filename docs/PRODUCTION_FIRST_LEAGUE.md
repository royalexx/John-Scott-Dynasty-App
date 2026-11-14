# First-time league initialization — database-only manager PINs

**Status:** Draft PR #47, based on the integrated backend/UI release branch.
This process is only for the owner's newly created Prisma Postgres database after the five migrations succeeded. It is **not** a database reset or an import of historical game results.

## Data and credential policy

- **No manager PINs or credential lists are saved to local files.** The initializer reads the commissioner's chosen four-digit PIN from a temporary process environment variable, uses it to create a salted scrypt hash, and stores only that hash in PostgreSQL.
- The 11 other managers receive unrevealed random initial PINs, also stored **only as salted scrypt hashes** in PostgreSQL. They cannot sign in until the commissioner assigns them their chosen PINs through **Commissioner Rulebook → Tools → Manager PINs**.
- The commissioner can replace a friend's PIN by selecting the manager, confirming their own commissioner PIN, and entering the friend's new four-digit PIN. A new PIN replaces the previous hash and invalidates the friend's old sessions. There is **no read/reveal endpoint** for existing PINs; a forgotten PIN is replaced, not recovered.
- The existing four-digit PIN keypad and PostgreSQL-backed failed-login throttling remain intact. PINs are never printed to stdout, committed to Git, or stored in browser localStorage.
- The shared development PIN `1234` is not accepted by the production initializer and cannot be assigned through the commissioner reset tool.
- The development fixture command `npm run prisma:seed` still rejects Production and still uses fixture PINs **only in isolated test databases**.

## Before initialization

1. In Prisma Postgres, **revoke/rotate any credential previously exposed in chat or terminal history**. Ensure Vercel's connected secret is valid.
2. The Vercel integration already exposes a direct `DATABASE_URL` and `DATABASE_URL_POOLED`. **Isolate Preview before running database-writing preview tests.** Do not connect Preview and Production to the same mutable database for those tests.
3. Confirm the correct database was migrated: `npx prisma migrate status` lists the five applied migrations, and the read-only `node scripts/migration-preflight.mjs` reports `HISTORY_READY`. This preflight checks structure and history; the bootstrap itself rejects any nonempty application table.
4. Check out `feat/one-time-production-bootstrap-20261114` (or its merged parent after review) and run `npm ci`.
5. Confirm no one else is initializing, syncing or writing to this database.

## One-time initialization from PowerShell

The following uses temporary environment variables and **creates no local PIN file**. Only execute against the confirmed **new, empty** database:

```powershell
$secureUrl = Read-Host "Paste your current DIRECT PostgreSQL URL" -AsSecureString
$securePin = Read-Host "Choose your initial commissioner PIN (4 digits, not 1234)" -AsSecureString

try {
    $env:DATABASE_URL = [System.Net.NetworkCredential]::new("", $secureUrl).Password.Trim().Trim('"', "'")
    $env:JSD_INITIAL_COMMISSIONER_PIN = [System.Net.NetworkCredential]::new("", $securePin).Password

    if ($env:DATABASE_URL -notmatch '^postgres(ql)?://') { throw "Invalid direct database URL" }
    if ($env:JSD_INITIAL_COMMISSIONER_PIN -notmatch '^\d{4}$' -or $env:JSD_INITIAL_COMMISSIONER_PIN -eq "1234") {
        throw "Choose a four-digit commissioner PIN other than 1234"
    }

    node scripts/migration-preflight.mjs
    if ($LASTEXITCODE -ne 0) { throw "Read-only preflight failed" }

    $env:JSD_BOOTSTRAP_CONFIRM = "INITIALIZE_NEW_EMPTY_JOHN_SCOTT_LEAGUE"
    npm run prisma:bootstrap-production
    if ($LASTEXITCODE -ne 0) { throw "Bootstrap failed: do not rerun against partial data" }
}
finally {
    Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:\JSD_INITIAL_COMMISSIONER_PIN -ErrorAction SilentlyContinue
    Remove-Item Env:\JSD_BOOTSTRAP_CONFIRM -ErrorAction SilentlyContinue
    $secureUrl = $null
    $securePin = $null
}
```

The initial commissioner signs into **Montreal Monarchs** with the chosen PIN. Only the salted hash is kept in PostgreSQL. If a PIN is lost, the owner must use the appropriate authenticated PIN-change or reset flow; the database hash cannot be reversed.

## After deployment

1. Sign in to `johnscottdynasty.live` as commissioner using your chosen initial PIN.
2. Open **League & Team Settings → Commissioner Rulebook → Tools → Manager PINs**.
3. For each friend: select their manager, enter the commissioner PIN, choose their four-digit PIN, and press **Set manager PIN**. Share the new PIN privately.
4. The friend can sign in normally and change their own PIN later using the existing account PIN-change feature.
5. Validate persisted rosters, matchups, and scheduled NHL synchronization before enabling full operation.

## Safety

The initializer checks all 23 Prisma application tables for data and verifies exactly five applied release migrations before writing. The setup is first-use only; attempts to rerun against populated tables are rejected. If initialization fails midway, inspect the partial state — **do not delete existing records or bypass the guard**.

The first 12 rosters and schedule are seeded demonstration league starting state, not recovered historical scores. The release does not fabricate old DAILY lineup snapshots.
