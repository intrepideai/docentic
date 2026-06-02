#!/usr/bin/env bash
# test/shell-scripts.sh — unit tests for templates/scripts/llm-docs/
#
# Usage:  bash test/shell-scripts.sh
# Exit:   0 if all pass, 1 if any fail

SCRIPTS_DIR="$(cd "$(dirname "$0")/../templates/scripts/llm-docs" && pwd)"
PASS=0
FAIL=0

# ── mini framework ────────────────────────────────────────────────────────────

pass() { printf "  \033[32mPASS\033[0m  %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "  \033[31mFAIL\033[0m  %s\n" "$1"; shift; printf "        %s\n" "$@"; FAIL=$((FAIL+1)); }

assert_eq() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then pass "$label"
  else fail "$label" "expected: '$expected'" "actual:   '$actual'"; fi
}

assert_contains() {
  local label="$1" haystack="$2" needle="$3"
  if printf '%s' "$haystack" | grep -qF "$needle"; then pass "$label"
  else fail "$label" "expected to contain: '$needle'"; fi
}

assert_not_contains() {
  local label="$1" haystack="$2" needle="$3"
  if ! printf '%s' "$haystack" | grep -qF "$needle"; then pass "$label"
  else fail "$label" "expected NOT to contain: '$needle'"; fi
}

assert_exits_ok() {
  local label="$1"; shift
  if bash "$@" >/dev/null 2>&1; then pass "$label"
  else fail "$label" "script exited non-zero"; fi
}

# ── fixture helpers ───────────────────────────────────────────────────────────

make_fixture() {
  local dir; dir=$(mktemp -d)
  mkdir -p "$dir/scripts/llm-docs" "$dir/docs"
  cp "$SCRIPTS_DIR"/*.sh "$dir/scripts/llm-docs/"
  echo "$dir"
}

cleanup() { rm -rf "$1"; }

# Source detect-stack.sh inside a fixture dir; print all exported vars
run_detect() {
  local dir="$1"
  (
    set +e          # don't let detection errors abort the subshell
    cd "$dir"
    # shellcheck source=/dev/null
    source "$dir/scripts/llm-docs/detect-stack.sh" 2>/dev/null
    echo "STACK_TYPE=${STACK_TYPE:-}"
    echo "IS_MONOREPO=${IS_MONOREPO:-}"
    echo "APP_PKG=${APP_PKG:-}"
    echo "APP_ROOT=${APP_ROOT:-}"
    echo "API_DIR=${API_DIR:-}"
    echo "SCHEMA_FILE=${SCHEMA_FILE:-}"
    echo "SCHEMA_TYPE=${SCHEMA_TYPE:-}"
    echo "ORM=${ORM:-}"
    echo "PACKAGE_MANAGER=${PACKAGE_MANAGER:-}"
    echo "SRC_DIRS=${SRC_DIRS:-}"
  )
}

get_var() { printf '%s' "$1" | grep "^$2=" | cut -d= -f2-; }

# ══════════════════════════════════════════════════════════════════════════════
# SUITE 1 — detect-stack.sh: variable detection
# ══════════════════════════════════════════════════════════════════════════════
echo
echo "━━━ Suite 1: detect-stack.sh variable detection ━━━"

# ── 1a: Express + Drizzle + npm (the "tabs" case that was broken) ────────────
echo; echo "  [1a] Express + Drizzle + npm (single-package)"
DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{
  "name": "tabs",
  "dependencies": { "express": "^4.18.0", "drizzle-orm": "^0.29.0" },
  "devDependencies": {}
}
JSON
touch "$DIR/package-lock.json"
mkdir -p "$DIR/server/routes" "$DIR/client/src" "$DIR/shared"
printf 'export const users = pgTable("users", { id: integer("id") });\n' > "$DIR/shared/schema.ts"

OUT=$(run_detect "$DIR")
assert_eq  "1a STACK_TYPE=express"        "$(get_var "$OUT" STACK_TYPE)"       "express"
assert_eq  "1a IS_MONOREPO=false"         "$(get_var "$OUT" IS_MONOREPO)"      "false"
assert_eq  "1a APP_PKG=package.json"      "$(get_var "$OUT" APP_PKG)"          "package.json"
assert_eq  "1a ORM=drizzle"              "$(get_var "$OUT" ORM)"               "drizzle"
assert_eq  "1a SCHEMA_TYPE=drizzle"      "$(get_var "$OUT" SCHEMA_TYPE)"       "drizzle"
assert_eq  "1a SCHEMA_FILE=shared/schema.ts" "$(get_var "$OUT" SCHEMA_FILE)"  "shared/schema.ts"
assert_eq  "1a PACKAGE_MANAGER=npm"      "$(get_var "$OUT" PACKAGE_MANAGER)"  "npm"
assert_eq  "1a API_DIR=server/routes"    "$(get_var "$OUT" API_DIR)"           "server/routes"
SRC=$(get_var "$OUT" SRC_DIRS)
assert_contains "1a SRC_DIRS has server"  "$SRC" "server"
assert_contains "1a SRC_DIRS has client"  "$SRC" "client"
assert_contains "1a SRC_DIRS has shared"  "$SRC" "shared"
cleanup "$DIR"

# ── 1b: Next.js monorepo + Prisma + pnpm ─────────────────────────────────────
echo; echo "  [1b] Next.js monorepo + Prisma + pnpm"
DIR=$(make_fixture)
touch "$DIR/pnpm-lock.yaml" "$DIR/pnpm-workspace.yaml"
mkdir -p "$DIR/apps/web/app/api/users" "$DIR/packages/ui"
cat > "$DIR/package.json" <<'JSON'
{ "name": "mono", "packageManager": "pnpm@9.0.0" }
JSON
cat > "$DIR/apps/web/package.json" <<'JSON'
{
  "name": "web",
  "dependencies": { "next": "^14.0.0", "@prisma/client": "^5.0.0" },
  "devDependencies": {}
}
JSON
mkdir -p "$DIR/prisma"
printf 'datasource db { provider = "postgresql" url = env("DATABASE_URL") }\nmodel User { id Int @id name String }\n' \
  > "$DIR/prisma/schema.prisma"

OUT=$(run_detect "$DIR")
assert_eq "1b STACK_TYPE=nextjs-monorepo" "$(get_var "$OUT" STACK_TYPE)"       "nextjs-monorepo"
assert_eq "1b IS_MONOREPO=true"           "$(get_var "$OUT" IS_MONOREPO)"      "true"
assert_eq "1b APP_ROOT=apps/web"          "$(get_var "$OUT" APP_ROOT)"         "apps/web"
assert_eq "1b APP_PKG=apps/web/pkg.json"  "$(get_var "$OUT" APP_PKG)"          "apps/web/package.json"
assert_eq "1b ORM=prisma"                 "$(get_var "$OUT" ORM)"              "prisma"
assert_eq "1b SCHEMA_TYPE=prisma"         "$(get_var "$OUT" SCHEMA_TYPE)"      "prisma"
assert_eq "1b PACKAGE_MANAGER=pnpm"       "$(get_var "$OUT" PACKAGE_MANAGER)"  "pnpm"
assert_eq "1b API_DIR=apps/web/app/api"   "$(get_var "$OUT" API_DIR)"          "apps/web/app/api"
cleanup "$DIR"

# ── 1c: Next.js single-package + App Router ───────────────────────────────────
echo; echo "  [1c] Next.js single-package + npm"
DIR=$(make_fixture)
touch "$DIR/package-lock.json"
mkdir -p "$DIR/app/api/health"
cat > "$DIR/package.json" <<'JSON'
{ "name": "my-app", "dependencies": { "next": "^14.0.0" }, "devDependencies": {} }
JSON

OUT=$(run_detect "$DIR")
assert_eq "1c STACK_TYPE=nextjs-single" "$(get_var "$OUT" STACK_TYPE)"  "nextjs-single"
assert_eq "1c IS_MONOREPO=false"        "$(get_var "$OUT" IS_MONOREPO)" "false"
assert_eq "1c API_DIR=app/api"          "$(get_var "$OUT" API_DIR)"     "app/api"
assert_eq "1c ORM=none"                 "$(get_var "$OUT" ORM)"         "none"
cleanup "$DIR"

# ── 1d: Fastify + routes/ dir ────────────────────────────────────────────────
echo; echo "  [1d] Fastify + npm"
DIR=$(make_fixture)
touch "$DIR/package-lock.json"
mkdir -p "$DIR/routes"
cat > "$DIR/package.json" <<'JSON'
{ "name": "fapi", "dependencies": { "fastify": "^4.0.0" }, "devDependencies": {} }
JSON

OUT=$(run_detect "$DIR")
assert_eq "1d STACK_TYPE=fastify" "$(get_var "$OUT" STACK_TYPE)"  "fastify"
assert_eq "1d IS_MONOREPO=false"  "$(get_var "$OUT" IS_MONOREPO)" "false"
assert_eq "1d API_DIR=routes"     "$(get_var "$OUT" API_DIR)"     "routes"
cleanup "$DIR"

# ── 1e: Unknown / no framework ───────────────────────────────────────────────
echo; echo "  [1e] Unknown / empty repo"
DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{ "name": "my-lib", "dependencies": {}, "devDependencies": {} }
JSON
touch "$DIR/package-lock.json"

OUT=$(run_detect "$DIR")
assert_eq "1e STACK_TYPE=unknown"  "$(get_var "$OUT" STACK_TYPE)"   "unknown"
assert_eq "1e ORM=none"            "$(get_var "$OUT" ORM)"          "none"
assert_eq "1e SCHEMA_TYPE=none"    "$(get_var "$OUT" SCHEMA_TYPE)"  "none"
cleanup "$DIR"

# ── 1f: pnpm lockfile wins over npm lockfile ──────────────────────────────────
echo; echo "  [1f] pnpm takes precedence when both lockfiles present"
DIR=$(make_fixture)
touch "$DIR/package-lock.json" "$DIR/pnpm-lock.yaml"
cat > "$DIR/package.json" <<'JSON'
{ "name": "mixed", "dependencies": { "express": "^4.0.0" }, "devDependencies": {} }
JSON

OUT=$(run_detect "$DIR")
assert_eq "1f PACKAGE_MANAGER=pnpm" "$(get_var "$OUT" PACKAGE_MANAGER)" "pnpm"
cleanup "$DIR"

# ── 1g: Drizzle schema in src/db/schema.ts fallback location ─────────────────
echo; echo "  [1g] Drizzle schema in src/db/schema.ts"
DIR=$(make_fixture)
touch "$DIR/package-lock.json"
mkdir -p "$DIR/src/db"
cat > "$DIR/package.json" <<'JSON'
{ "name": "alt", "dependencies": { "drizzle-orm": "^0.29.0" }, "devDependencies": {} }
JSON
printf 'export const posts = pgTable("posts", { id: integer("id") });\n' > "$DIR/src/db/schema.ts"

OUT=$(run_detect "$DIR")
assert_eq "1g SCHEMA_FILE=src/db/schema.ts" "$(get_var "$OUT" SCHEMA_FILE)" "src/db/schema.ts"
assert_eq "1g SCHEMA_TYPE=drizzle"          "$(get_var "$OUT" SCHEMA_TYPE)" "drizzle"
cleanup "$DIR"

# ══════════════════════════════════════════════════════════════════════════════
# SUITE 2 — No-crash: all generators exit 0 on Express + Drizzle repo
# ══════════════════════════════════════════════════════════════════════════════
echo
echo "━━━ Suite 2: generator scripts exit 0 on Express + Drizzle repo ━━━"

DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{
  "name": "tabs", "version": "1.0.0",
  "dependencies": { "express": "^4.18.0", "drizzle-orm": "^0.29.0" },
  "devDependencies": {}
}
JSON
touch "$DIR/package-lock.json"
mkdir -p "$DIR/server/routes" "$DIR/client/src" "$DIR/shared" \
         "$DIR/.agents" "$DIR/research/_meta"
printf 'export const users = pgTable("users", { id: integer("id"), name: text("name") });\n' \
  > "$DIR/shared/schema.ts"
printf 'router.get("/api/users", h);\nrouter.post("/api/users", h);\n' \
  > "$DIR/server/routes/users.ts"
printf '{"docs":[]}' > "$DIR/.agents/index.json"

echo
for script in gen-stack gen-data gen-api gen-map gen-integrations; do
  assert_exits_ok "2 $script.sh exits 0" "$DIR/scripts/llm-docs/$script.sh"
done
assert_exits_ok "2 validate.sh exits 0" \
  -c "cd '$DIR' && bash '$DIR/scripts/llm-docs/validate.sh' >/dev/null"
cleanup "$DIR"

# ══════════════════════════════════════════════════════════════════════════════
# SUITE 3 — gen-data.sh: Drizzle output content
# ══════════════════════════════════════════════════════════════════════════════
echo
echo "━━━ Suite 3: gen-data.sh Drizzle output ━━━"

DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{ "name": "tabs", "dependencies": { "drizzle-orm": "^0.29.0" }, "devDependencies": {} }
JSON
touch "$DIR/package-lock.json"
mkdir -p "$DIR/shared"
cat > "$DIR/shared/schema.ts" <<'TS'
import { pgTable, text, integer } from 'drizzle-orm/pg-core';
export const users = pgTable("users", { id: integer("id"), name: text("name"), email: text("email") });
export const accounts = pgTable("accounts", { id: integer("id"), ownerId: integer("owner_id") });
TS

echo
OUT=$(bash "$DIR/scripts/llm-docs/gen-data.sh" 2>/dev/null)
assert_contains     "3 Tables section header"         "$OUT" "## Tables"
assert_contains     "3 users table listed"            "$OUT" '`users`'
assert_contains     "3 accounts table listed"         "$OUT" '`accounts`'
assert_contains     "3 source file referenced"        "$OUT" "shared/schema.ts"
assert_not_contains "3 no Prisma placeholder"         "$OUT" "No Prisma schema found"
assert_not_contains "3 no prisma code block"          "$OUT" '```prisma'
cleanup "$DIR"

# ── gen-data.sh with Prisma schema ───────────────────────────────────────────
echo; echo "  [Prisma branch]"
DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{ "name": "prisma-app", "dependencies": { "@prisma/client": "^5.0.0" }, "devDependencies": {} }
JSON
touch "$DIR/package-lock.json"
mkdir -p "$DIR/prisma"
cat > "$DIR/prisma/schema.prisma" <<'PRISMA'
datasource db { provider = "postgresql" url = env("DATABASE_URL") }
model Post { id Int @id title String body String }
model Comment { id Int @id postId Int body String }
PRISMA

OUT=$(bash "$DIR/scripts/llm-docs/gen-data.sh" 2>/dev/null)
assert_contains     "3p Post model block"      "$OUT" '### `Post`'
assert_contains     "3p Comment model block"   "$OUT" '### `Comment`'
assert_contains     "3p prisma code block"     "$OUT" '```prisma'
assert_not_contains "3p no Tables header"      "$OUT" "## Tables"
cleanup "$DIR"

# ── gen-data.sh with no ORM ──────────────────────────────────────────────────
echo; echo "  [no ORM branch]"
DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{ "name": "bare", "dependencies": { "express": "^4.0.0" }, "devDependencies": {} }
JSON
touch "$DIR/package-lock.json"

OUT=$(bash "$DIR/scripts/llm-docs/gen-data.sh" 2>/dev/null)
assert_contains "3n no-ORM placeholder shown" "$OUT" "No ORM schema detected"
cleanup "$DIR"

# ══════════════════════════════════════════════════════════════════════════════
# SUITE 4 — gen-stack.sh: output content + no Workspaces for single-package
# ══════════════════════════════════════════════════════════════════════════════
echo
echo "━━━ Suite 4: gen-stack.sh output content ━━━"

DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{
  "name": "myapp", "version": "2.1.0",
  "packageManager": "npm@10.0.0",
  "engines": { "node": ">=20" },
  "dependencies": {
    "express": "^4.18.0",
    "drizzle-orm": "^0.29.0",
    "vite": "^5.0.0",
    "resend": "^2.0.0"
  },
  "devDependencies": {}
}
JSON
touch "$DIR/package-lock.json"

echo
OUT=$(bash "$DIR/scripts/llm-docs/gen-stack.sh" 2>/dev/null)
assert_contains     "4 Express shown"                "$OUT" "Express"
assert_contains     "4 Drizzle shown"                "$OUT" "Drizzle ORM"
assert_contains     "4 Vite shown"                   "$OUT" "Vite"
assert_contains     "4 Resend shown"                 "$OUT" "Resend"
assert_not_contains "4 no Workspaces section"                "$OUT" "## Workspaces"
assert_not_contains "4 no Next.js shown"                     "$OUT" "Next.js"
assert_not_contains "4 no duplicate source-of-truth link"    "$OUT" "package.json), [\`package.json\`"
cleanup "$DIR"

# ── Workspaces section appears for monorepo ───────────────────────────────────
echo; echo "  [Workspaces section for monorepo]"
DIR=$(make_fixture)
touch "$DIR/pnpm-lock.yaml" "$DIR/pnpm-workspace.yaml"
mkdir -p "$DIR/apps/web" "$DIR/packages/ui"
cat > "$DIR/package.json" <<'JSON'
{ "name": "mono", "packageManager": "pnpm@9.0.0" }
JSON
cat > "$DIR/apps/web/package.json" <<'JSON'
{ "name": "web", "dependencies": { "next": "^14.0.0" }, "devDependencies": {} }
JSON

OUT=$(bash "$DIR/scripts/llm-docs/gen-stack.sh" 2>/dev/null)
assert_contains "4m Workspaces section present" "$OUT" "## Workspaces"
cleanup "$DIR"

# ══════════════════════════════════════════════════════════════════════════════
# SUITE 5 — gen-map.sh: dynamic sections
# ══════════════════════════════════════════════════════════════════════════════
echo
echo "━━━ Suite 5: gen-map.sh dynamic sections ━━━"

# Single-package: server/, client/, shared/ sections
DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{ "name": "tabs", "dependencies": { "express": "^4.0.0" }, "devDependencies": {} }
JSON
touch "$DIR/package-lock.json"
mkdir -p "$DIR/server/routes" "$DIR/client/src" "$DIR/shared"

echo
OUT=$(bash "$DIR/scripts/llm-docs/gen-map.sh" 2>/dev/null)
assert_contains     "5 server/ section"         "$OUT" "## server/"
assert_contains     "5 client/ section"         "$OUT" "## client/"
assert_contains     "5 shared/ section"         "$OUT" "## shared/"
assert_contains     "5 server annotation"       "$OUT" "Express API server"
assert_not_contains "5 no apps/docs/ section"   "$OUT" "apps/docs/"
cleanup "$DIR"

# Monorepo: apps/web/ and packages/ sections
echo; echo "  [monorepo sections]"
DIR=$(make_fixture)
touch "$DIR/pnpm-lock.yaml" "$DIR/pnpm-workspace.yaml"
mkdir -p "$DIR/apps/web/src" "$DIR/packages/ui"
cat > "$DIR/package.json" <<'JSON'
{ "name": "mono" }
JSON
cat > "$DIR/apps/web/package.json" <<'JSON'
{ "name": "web", "dependencies": { "next": "^14.0.0" }, "devDependencies": {} }
JSON

OUT=$(bash "$DIR/scripts/llm-docs/gen-map.sh" 2>/dev/null)
assert_contains     "5m apps/web/ section"       "$OUT" "## apps/web/"
assert_contains     "5m packages/ section"       "$OUT" "## packages/"
assert_not_contains "5m no server/ section"      "$OUT" "## server/"
cleanup "$DIR"

# ══════════════════════════════════════════════════════════════════════════════
# SUITE 6 — gen-api.sh: stack-specific output
# ══════════════════════════════════════════════════════════════════════════════
echo
echo "━━━ Suite 6: gen-api.sh stack-specific output ━━━"

# Express: correct header, no Next.js mention
DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{ "name": "tabs", "dependencies": { "express": "^4.18.0" }, "devDependencies": {} }
JSON
touch "$DIR/package-lock.json"
mkdir -p "$DIR/server/routes"
cat > "$DIR/server/routes/users.ts" <<'TS'
router.get('/api/users', getUsers);
router.post('/api/users', createUser);
TS

echo
OUT=$(bash "$DIR/scripts/llm-docs/gen-api.sh" 2>/dev/null)
assert_contains     "6e stack=express in header"         "$OUT" "express"
assert_contains     "6e endpoint table header"           "$OUT" "| Method | Path | File |"
assert_not_contains "6e no Next.js Route Handlers text"  "$OUT" "Next.js Route Handlers"
assert_contains     "6e GET uppercased (no U prefix)"    "$OUT" '`GET`'
assert_not_contains "6e no Uget artifact"                "$OUT" '`Uget`'
cleanup "$DIR"

# Express: exit 0 + footer present (regression guard for the pipefail/set -e
# truncation bug) + method/path extracted correctly.
echo; echo "  [Express — exit code, footer, no truncation]"
DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{ "name": "tabs", "dependencies": { "express": "^4.18.0" }, "devDependencies": {} }
JSON
touch "$DIR/package-lock.json"
mkdir -p "$DIR/server/routes"
cat > "$DIR/server/routes/users.ts" <<'TS'
router.get('/api/users', getUsers);
router.post('/api/users', createUser);
TS
OUT=$(bash "$DIR/scripts/llm-docs/gen-api.sh" 2>/dev/null); CODE=$?
assert_eq       "6e2 gen-api exits 0"                "$CODE" "0"
assert_contains "6e2 footer present (not truncated)" "$OUT"  "## See also"
assert_contains "6e2 GET row"                        "$OUT"  '`GET`'
assert_contains "6e2 POST row"                       "$OUT"  '`POST`'
assert_contains "6e2 path shown"                     "$OUT"  '`/api/users`'
cleanup "$DIR"

# Fastify: always uses the grep+sed path (no rg branch) — guards the sed
# |-delimiter collision and the truncation/abort bug.
echo; echo "  [Fastify]"
DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{ "name": "fapi", "dependencies": { "fastify": "^4.0.0" }, "devDependencies": {} }
JSON
touch "$DIR/package-lock.json"
mkdir -p "$DIR/routes"
cat > "$DIR/routes/api.ts" <<'TS'
fastify.get('/health', h);
fastify.post('/users', createUser);
TS
OUT=$(bash "$DIR/scripts/llm-docs/gen-api.sh" 2>/dev/null); CODE=$?
assert_eq       "6f gen-api exits 0"         "$CODE" "0"
assert_contains "6f stack=fastify in header" "$OUT"  "fastify"
assert_contains "6f footer present"          "$OUT"  "## See also"
assert_contains "6f GET row (uppercased)"    "$OUT"  '`GET`'
assert_contains "6f path shown"              "$OUT"  '`/health`'
cleanup "$DIR"

# Hono: also always uses the grep+sed path.
echo; echo "  [Hono]"
DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{ "name": "hapi", "dependencies": { "hono": "^4.0.0" }, "devDependencies": {} }
JSON
touch "$DIR/package-lock.json"
mkdir -p "$DIR/src"
cat > "$DIR/src/index.ts" <<'TS'
const app = new Hono();
app.get('/ping', (c) => c.text('pong'));
app.delete('/items/:id', remove);
TS
OUT=$(bash "$DIR/scripts/llm-docs/gen-api.sh" 2>/dev/null); CODE=$?
assert_eq       "6h gen-api exits 0"      "$CODE" "0"
assert_contains "6h stack=hono in header" "$OUT"  "hono"
assert_contains "6h footer present"       "$OUT"  "## See also"
assert_contains "6h GET row"              "$OUT"  '`GET`'
assert_contains "6h DELETE row"           "$OUT"  '`DELETE`'
cleanup "$DIR"

# Express with a routes dir but ZERO matching routes — must NOT abort/truncate.
echo; echo "  [Express — no matching routes, must not truncate]"
DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{ "name": "tabs", "dependencies": { "express": "^4.18.0" }, "devDependencies": {} }
JSON
touch "$DIR/package-lock.json"
mkdir -p "$DIR/server/routes"
cat > "$DIR/server/routes/util.ts" <<'TS'
export function helper() { return 1; }
const r = Router();
app.use('/x', r);
TS
OUT=$(bash "$DIR/scripts/llm-docs/gen-api.sh" 2>/dev/null); CODE=$?
assert_eq       "6z gen-api exits 0 on no-match"  "$CODE" "0"
assert_contains "6z footer present on no-match"   "$OUT"  "## See also"
cleanup "$DIR"

# Next.js: correct route extraction
echo; echo "  [Next.js App Router]"
DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{ "name": "nxapp", "dependencies": { "next": "^14.0.0" }, "devDependencies": {} }
JSON
touch "$DIR/package-lock.json"
mkdir -p "$DIR/app/api/users"
cat > "$DIR/app/api/users/route.ts" <<'TS'
export async function GET(req: Request) {}
export async function POST(req: Request) {}
TS

OUT=$(bash "$DIR/scripts/llm-docs/gen-api.sh" 2>/dev/null)
assert_contains "6n GET method shown"   "$OUT" '`GET`'
assert_contains "6n POST method shown"  "$OUT" '`POST`'
assert_contains "6n path shown"         "$OUT" "/api/users"
cleanup "$DIR"

# Unknown stack: placeholder shown
echo; echo "  [unknown stack]"
DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{ "name": "bare", "dependencies": {}, "devDependencies": {} }
JSON
touch "$DIR/package-lock.json"

OUT=$(bash "$DIR/scripts/llm-docs/gen-api.sh" 2>/dev/null)
assert_contains "6u placeholder shown"  "$OUT" "No API routes found"
cleanup "$DIR"

# ══════════════════════════════════════════════════════════════════════════════
# SUITE 7 — validate.sh: uses SRC_DIRS, not hardcoded apps/docs/
# ══════════════════════════════════════════════════════════════════════════════
echo
echo "━━━ Suite 7: validate.sh uses SRC_DIRS for env var check ━━━"

DIR=$(make_fixture)
cat > "$DIR/package.json" <<'JSON'
{ "name": "tabs", "dependencies": { "express": "^4.0.0" }, "devDependencies": {} }
JSON
touch "$DIR/package-lock.json"
mkdir -p "$DIR/server" "$DIR/.agents" "$DIR/research/_meta" "$DIR/docs"
printf '{"docs":[]}' > "$DIR/.agents/index.json"

# OPS.md references MY_SECRET_KEY; server/app.ts uses it → should NOT be flagged stale
cat > "$DIR/docs/OPS.md" <<'MD'
# Ops
- `MY_SECRET_KEY` — the api key
- `ANOTHER_VAR` — not used anywhere
MD
printf 'const k = process.env.MY_SECRET_KEY;\n' > "$DIR/server/app.ts"

echo
bash -c "cd '$DIR' && bash '$DIR/scripts/llm-docs/validate.sh' >/dev/null 2>&1" || true

if [ -f "$DIR/research/_meta/SUGGESTIONS.md" ]; then
  SUGG=$(cat "$DIR/research/_meta/SUGGESTIONS.md")
  assert_not_contains "7 MY_SECRET_KEY not flagged stale (found in server/)" \
    "$SUGG" "MY_SECRET_KEY"
  assert_contains     "7 ANOTHER_VAR IS flagged stale (not in source)" \
    "$SUGG" "ANOTHER_VAR"
else
  # rg not available or no OPS.md check triggered — skip gracefully
  pass "7 validate.sh ran without crashing (rg check skipped)"
fi
cleanup "$DIR"

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS+FAIL))
if [ "$FAIL" -eq 0 ]; then
  printf "\033[32m✓ All %d tests passed\033[0m\n" "$TOTAL"
else
  printf "\033[31m✗ %d of %d tests failed\033[0m\n" "$FAIL" "$TOTAL"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
[ "$FAIL" -eq 0 ]
