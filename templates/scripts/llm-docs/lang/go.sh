#!/usr/bin/env bash
# lang/go.sh — Go adapter for the llm-docs generators.
#
# Sourced by gen-*.sh when detect-stack.sh reports LANGUAGE=go. Provides:
#   lang_stack       — STACK.md body (module, Go version, key deps)
#   lang_api         — API.md endpoints (net/http · gin · chi · echo · gorilla/mux)
#   lang_data        — DATA.md entities (GORM models)
#   lang_env_names   — env vars referenced (os.Getenv / os.LookupEnv) under SRC_DIRS
#   lang_services    — INTEGRATIONS.md "Detected services" rows
#
# All functions are best-effort static scans and ALWAYS return 0.

_go_files() {
  local dirs="${SRC_DIRS:-.}"
  [ -z "$dirs" ] && dirs="."
  # shellcheck disable=SC2086
  find $dirs -type f -name '*.go' \
    -not -name '*_test.go' -not -path '*/vendor/*' -not -path '*/node_modules/*' \
    2>/dev/null | sort
}

# Module require paths from go.mod (both `require (...)` blocks and single lines).
_go_requires() {
  [ -f go.mod ] || return 0
  awk '
    /^require[[:space:]]*\(/ { inblk=1; next }
    inblk && /^\)/ { inblk=0; next }
    inblk && /^[[:space:]]*\/\// { next }   # skip comment lines inside require()
    inblk { print $1; next }
    /^require[[:space:]]+[^([:space:]]/ { print $2 }
  ' go.mod 2>/dev/null | grep -vE '^(//|$)' | sort -u || true
}

lang_stack() {
  local module gover
  module="$(grep -E '^module[[:space:]]+' go.mod 2>/dev/null | head -1 | awk '{print $2}' || true)"
  gover="$(grep -E '^go[[:space:]]+[0-9]' go.mod 2>/dev/null | head -1 | awk '{print $2}' || true)"
  [ -n "$MANIFEST" ] && echo "> **Source of truth:** [\`$MANIFEST\`](../$MANIFEST)"
  cat <<EOF

## Repo

| Field | Value |
|---|---|
| Module | \`${module:-—}\` |
| Package manager | \`go modules\` |

## Runtime

| Component | Version |
|---|---|
| Go | \`${gover:-(see go.mod)}\` |

## Key dependencies
EOF
  echo
  local deps; deps="$(_go_requires | head -20)"
  if [ -n "$deps" ]; then
    echo '```'
    printf '%s\n' "$deps"
    echo '```'
  else
    echo "_No \`require\` entries parsed — see [\`$MANIFEST\`](../$MANIFEST)._"
  fi
  return 0
}

lang_api() {
  local files; files="$(_go_files)"
  [ -z "$files" ] && { echo "_No Go source files found under \`${SRC_DIRS:-.}\`._"; return 0; }

  # gin/chi/echo: r.GET("/x", …) ; net/http & gorilla/mux: HandleFunc("/x", …).
  # grep -o emits one record per occurrence, so multiple route registrations on
  # a single line are all captured (not just the last).
  local hits
  hits="$(printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -EHo \
    '\.(GET|POST|PUT|PATCH|DELETE|Get|Post|Put|Patch|Delete|HandleFunc|Handle)\([[:space:]]*"[^"]+"' \
    2>/dev/null || true)"
  if [ -z "$hits" ]; then
    echo "_No HTTP routes detected under \`${SRC_DIRS:-.}\` (looked for gin/chi/echo verbs and net/http HandleFunc). Document the routing here and re-run gen-api.sh._"
    return 0
  fi
  echo "| Method | Path | File |"
  echo "|---|---|---|"
  printf '%s\n' "$hits" | while IFS= read -r line; do
    [ -z "$line" ] && continue
    local file verb method path
    file="$(printf '%s' "$line" | cut -d: -f1)"; file="${file#./}"
    verb="$(printf '%s' "$line" | sed -E 's/.*\.(GET|POST|PUT|PATCH|DELETE|Get|Post|Put|Patch|Delete|HandleFunc|Handle)\(.*/\1/')"
    path="$(printf '%s' "$line" | sed -E 's/.*\.(GET|POST|PUT|PATCH|DELETE|Get|Post|Put|Patch|Delete|HandleFunc|Handle)\([[:space:]]*"([^"]+)".*/\2/')"
    [ "$path" = "$line" ] && continue
    case "$verb" in
      HandleFunc|Handle) method="*" ;;
      *) method="$(printf '%s' "$verb" | tr '[:lower:]' '[:upper:]')" ;;
    esac
    echo "| \`$method\` | \`$path\` | [\`$file\`](../$file) |"
  done
  return 0
}

lang_data() {
  local files; files="$(_go_files)"
  [ -z "$files" ] && { echo "> **Database:** none detected."; return 0; }

  # GORM models: a `type X struct { … }` whose body embeds gorm.Model or has a
  # gorm:"…" struct tag. awk tracks the struct body and emits FILE:Name.
  local models
  models="$(printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 awk '
    /^type[[:space:]]+[A-Z][A-Za-z0-9_]*[[:space:]]+struct[[:space:]]*\{/ { name=$2; inblk=1; ismodel=0; next }
    inblk && (/gorm\.Model/ || /gorm:"/) { ismodel=1 }
    inblk && /^\}/ { if (ismodel) print FILENAME":"name; inblk=0 }
  ' 2>/dev/null || true)"
  if [ -z "$models" ]; then
    echo "> **Database:** No GORM models detected."
    echo
    echo "_If this service uses sqlc, raw SQL, or another ORM, document the schema here and re-run gen-data.sh._"
    return 0
  fi
  echo "> **Database:** \`GORM\`"
  echo
  echo "## Models"
  echo
  echo "| Model | File |"
  echo "|---|---|"
  printf '%s\n' "$models" | while IFS= read -r line; do
    [ -z "$line" ] && continue
    local file cls
    file="$(printf '%s' "$line" | cut -d: -f1)"; file="${file#./}"
    cls="$(printf '%s' "$line" | cut -d: -f2-)"
    echo "| \`$cls\` | [\`$file\`](../$file) |"
  done
  return 0
}

lang_env_names() {
  local files; files="$(_go_files)"
  [ -z "$files" ] && return 0
  printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -EhoI \
    'os\.(Getenv|LookupEnv)\([[:space:]]*"[A-Z_][A-Z0-9_]*' 2>/dev/null \
    | grep -oE '"[A-Z_][A-Z0-9_]*' | tr -d '"' | sort -u || true
  return 0
}

lang_services() {
  [ -f go.mod ] || return 0
  local deps; deps="$(_go_requires)"
  _svc() { printf '%s' "$deps" | grep -qiE "$1" && echo "| **$2** | active | $3 | \`$4\` |"; return 0; }
  _svc 'jackc/pgx|lib/pq|gorm\.io'          'PostgreSQL'            '`DATABASE_URL`'           'pgx / gorm'
  _svc 'go-redis|redis/go-redis'             'Redis'                 '`REDIS_URL`'              'go-redis'
  _svc 'aws/aws-sdk-go'                       'AWS SDK'               '`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`' 'aws-sdk-go'
  _svc 'stripe/stripe-go'                     'Stripe'                '`STRIPE_SECRET_KEY`'      'stripe-go'
  _svc 'sendgrid'                             'SendGrid'              '`SENDGRID_API_KEY`'       'sendgrid'
  _svc 'getsentry/sentry-go'                  'Sentry'                '`SENTRY_DSN`'             'sentry-go'
  _svc 'aws/aws-sdk-go.*sqs|segmentio/kafka'  'Message queue'         '—'                        'queue'
  unset -f _svc 2>/dev/null || true
  return 0
}
