#!/usr/bin/env bash
# lang/php.sh — PHP / Laravel adapter for the llm-docs generators.
#
# Sourced by gen-*.sh when detect-stack.sh reports LANGUAGE=php. Provides:
#   lang_stack       — STACK.md body (name, PHP version, composer packages)
#   lang_api         — API.md endpoints from routes/*.php (Laravel)
#   lang_data        — DATA.md entities (Eloquent models)
#   lang_env_names   — env('X') / getenv('X') / $_ENV['X'] references
#   lang_services    — INTEGRATIONS.md "Detected services" rows
#
# Best-effort static scans; all functions ALWAYS return 0.

_php_files() {
  local dirs="${SRC_DIRS:-.}"
  [ -z "$dirs" ] && dirs="."
  # shellcheck disable=SC2086
  find $dirs -type f -name '*.php' \
    -not -path '*/vendor/*' -not -path '*/node_modules/*' 2>/dev/null | sort
}

# composer.json require package names (excluding the php platform requirement).
# require packages via jq. jq is assumed present (the JS generators use it
# unconditionally too); without it, services/deps just degrade to empty rather
# than mis-parsing the whole composer.json — including require-dev — as runtime
# deps, which the old grep fallback did.
_composer_requires() {
  [ -f composer.json ] || return 0
  command -v jq >/dev/null 2>&1 || return 0
  jq -r '(.require // {}) | keys[]' composer.json 2>/dev/null | grep -viE '^(php|ext-)' || true
}

lang_stack() {
  local name phpver
  if command -v jq >/dev/null 2>&1 && [ -f composer.json ]; then
    name="$(jq -r '.name // empty' composer.json 2>/dev/null || true)"
    phpver="$(jq -r '.require.php // empty' composer.json 2>/dev/null || true)"
  else
    name="$(grep -oE '"name"[[:space:]]*:[[:space:]]*"[^"]+"' composer.json 2>/dev/null | head -1 | sed -E 's/.*:[[:space:]]*"([^"]+)".*/\1/' || true)"
  fi
  [ -n "$MANIFEST" ] && echo "> **Source of truth:** [\`$MANIFEST\`](../$MANIFEST)"
  cat <<EOF

## Repo

| Field | Value |
|---|---|
| Name | \`${name:-—}\` |
| Package manager | \`composer\` |
$( [ -f artisan ] && echo "| Framework | \`Laravel\` |" )

## Runtime

| Component | Version |
|---|---|
| PHP | \`${phpver:-(see composer.json)}\` |

## Key packages
EOF
  echo
  local deps; deps="$(_composer_requires | head -20)"
  if [ -n "$deps" ]; then
    echo '```'
    printf '%s\n' "$deps"
    echo '```'
  else
    echo "_No \`require\` packages parsed — see [\`$MANIFEST\`](../$MANIFEST)._"
  fi
  return 0
}

lang_api() {
  local files; files="$(_php_files | grep -E '/routes/|routes\.php$' || true)"
  [ -z "$files" ] && files="$(_php_files)"
  [ -z "$files" ] && { echo "_No PHP route files found. Document the routing here and re-run gen-api.sh._"; return 0; }

  # Laravel: Route::get('/x', …); Route::resource('users', …). Both greps are
  # line-anchored (so commented `// Route::get(...)` is skipped); the verb loop
  # then extracts every occurrence on a line so stacked routes aren't dropped.
  # (Route::match/any take an array of verbs as the first arg — not a path — so
  # they're not extractable here and are intentionally omitted.)
  local verbs resources
  verbs="$(printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -EHn \
    "^[[:space:]]*Route::(get|post|put|patch|delete)\([[:space:]]*['\"][^'\"]+['\"]" 2>/dev/null || true)"
  resources="$(printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -EHn \
    "^[[:space:]]*Route::(resource|apiResource)\([[:space:]]*['\"][^'\"]+['\"]" 2>/dev/null || true)"

  if [ -z "$verbs$resources" ]; then
    echo "_No Laravel routes parsed (looked for Route::get/post/… and Route::resource). Document the routing here and re-run gen-api.sh._"
    return 0
  fi
  echo "| Method | Path / Resource | File |"
  echo "|---|---|---|"
  printf '%s\n' "$verbs" | while IFS= read -r line; do
    [ -z "$line" ] && continue
    local file content
    file="$(printf '%s' "$line" | cut -d: -f1)"; file="${file#./}"
    content="$(printf '%s' "$line" | cut -d: -f3-)"
    printf '%s' "$content" | grep -oE "Route::(get|post|put|patch|delete)\([[:space:]]*['\"][^'\"]+['\"]" | while IFS= read -r occ; do
      [ -z "$occ" ] && continue
      local verb path
      verb="$(printf '%s' "$occ" | sed -E "s/.*Route::(get|post|put|patch|delete).*/\1/" | tr '[:lower:]' '[:upper:]')"
      path="$(printf '%s' "$occ" | sed -E "s/.*['\"]([^'\"]+)['\"].*/\1/")"
      echo "| \`$verb\` | \`/$path\` | [\`$file\`](../$file) |" | sed 's#//#/#'
    done
  done
  printf '%s\n' "$resources" | while IFS= read -r line; do
    [ -z "$line" ] && continue
    local file name
    file="$(printf '%s' "$line" | cut -d: -f1)"; file="${file#./}"
    name="$(printf '%s' "$line" | sed -E "s/.*Route::[a-zA-Z]+\([[:space:]]*['\"]([^'\"]+)['\"].*/\1/")"
    echo "| \`RESTful\` | \`$name\` (index/show/store/update/destroy) | [\`$file\`](../$file) |"
  done
  return 0
}

lang_data() {
  local files; files="$(_php_files)"
  [ -z "$files" ] && { echo "> **Database:** none detected."; return 0; }
  # Eloquent: class X extends Model / Authenticatable. Anchored to line start so
  # commented `// class Ghost extends Model` isn't counted.
  local models
  models="$(printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -EHn \
    '^[[:space:]]*class[[:space:]]+[A-Z][A-Za-z0-9_]*[[:space:]]+extends[[:space:]]+(Model|Authenticatable)' \
    2>/dev/null || true)"
  if [ -z "$models" ]; then
    echo "> **Database:** No Eloquent models detected."
    echo
    echo "_If schema lives in migrations, reference \`database/migrations/\` here and re-run gen-data.sh._"
    return 0
  fi
  echo "> **Database:** \`Eloquent\`"
  echo
  echo "## Models"
  echo
  echo "| Model | File |"
  echo "|---|---|"
  printf '%s\n' "$models" | while IFS= read -r line; do
    [ -z "$line" ] && continue
    local file cls
    file="$(printf '%s' "$line" | cut -d: -f1)"; file="${file#./}"
    cls="$(printf '%s' "$line" | sed -E 's/.*class[[:space:]]+([A-Z][A-Za-z0-9_]*).*/\1/')"
    echo "| \`$cls\` | [\`$file\`](../$file) |"
  done
  return 0
}

lang_env_names() {
  local files; files="$(_php_files)"
  [ -z "$files" ] && return 0
  printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -EhoI \
    "(env\(|getenv\(|\\\$_ENV\[)[[:space:]]*['\"][A-Z_][A-Z0-9_]*" 2>/dev/null \
    | grep -oE '[A-Z_][A-Z0-9_]*$' | sort -u || true
  return 0
}

lang_services() {
  [ -f composer.json ] || return 0
  local deps; deps="$(_composer_requires)"
  _svc() { printf '%s' "$deps" | grep -qiE "$1" && echo "| **$2** | active | $3 | \`$4\` |"; return 0; }
  _svc 'laravel/framework'                'Laravel'               '`DB_*`, `APP_KEY`'        'laravel/framework'
  _svc 'predis/predis|laravel/redis'      'Redis'                 '`REDIS_URL`'              'predis'
  _svc 'aws/aws-sdk-php'                   'AWS SDK'               '`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`' 'aws-sdk-php'
  _svc 'stripe/stripe-php|laravel/cashier' 'Stripe'                '`STRIPE_SECRET`'          'stripe-php'
  _svc 'laravel/sanctum|laravel/passport' 'API auth'              '—'                        'sanctum / passport'
  _svc 'sentry/sentry-laravel'            'Sentry'                '`SENTRY_LARAVEL_DSN`'     'sentry-laravel'
  _svc 'guzzlehttp/guzzle'                'HTTP client (Guzzle)'  '—'                        'guzzle'
  unset -f _svc 2>/dev/null || true
  return 0
}
