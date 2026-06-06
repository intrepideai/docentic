#!/usr/bin/env bash
# lang/ruby.sh — Ruby / Rails adapter for the llm-docs generators.
#
# Sourced by gen-*.sh when detect-stack.sh reports LANGUAGE=ruby. Provides:
#   lang_stack       — STACK.md body (Ruby version, gems)
#   lang_api         — API.md endpoints from config/routes.rb (Rails)
#   lang_data        — DATA.md entities (ActiveRecord models)
#   lang_env_names   — ENV["X"] / ENV.fetch("X") references under SRC_DIRS
#   lang_services    — INTEGRATIONS.md "Detected services" rows
#
# Best-effort static scans; all functions ALWAYS return 0.

_rb_files() {
  local dirs="${SRC_DIRS:-.}"
  [ -z "$dirs" ] && dirs="."
  # shellcheck disable=SC2086
  find $dirs -type f -name '*.rb' \
    -not -path '*/vendor/*' -not -path '*/node_modules/*' 2>/dev/null | sort
}

lang_stack() {
  local rubyver
  if [ -f .ruby-version ]; then
    rubyver="$(head -1 .ruby-version 2>/dev/null | tr -d ' ')"
  else
    rubyver="$(grep -E '^[[:space:]]*ruby[[:space:]]+["'\'']' Gemfile 2>/dev/null | head -1 \
      | sed -E 's/.*["'\'']([0-9][0-9.]*)["'\''].*/\1/' || true)"
  fi
  [ -n "$MANIFEST" ] && echo "> **Source of truth:** [\`$MANIFEST\`](../$MANIFEST)"
  cat <<EOF

## Repo

| Field | Value |
|---|---|
| Package manager | \`bundler\` |
$( [ -f config/application.rb ] && echo "| Framework | \`Rails\` |" )

## Runtime

| Component | Version |
|---|---|
| Ruby | \`${rubyver:-(see .ruby-version / Gemfile)}\` |

## Key gems
EOF
  echo
  local gems
  gems="$(grep -E '^[[:space:]]*gem[[:space:]]+["'\'']' Gemfile 2>/dev/null \
    | sed -E 's/^[[:space:]]*gem[[:space:]]+["'\'']([^"'\'']+)["'\''].*/\1/' | sort -u | head -20 || true)"
  if [ -n "$gems" ]; then
    echo '```'
    printf '%s\n' "$gems"
    echo '```'
  else
    echo "_No gems parsed — see [\`$MANIFEST\`](../$MANIFEST)._"
  fi
  return 0
}

lang_api() {
  local routes="config/routes.rb"
  if [ ! -f "$routes" ]; then
    # Fall back to any routes.rb under the source dirs.
    routes="$(_rb_files | grep -E 'routes\.rb$' | head -1 || true)"
  fi
  [ -z "$routes" ] || [ ! -f "$routes" ] && { echo "_No \`config/routes.rb\` found. Document the routing here and re-run gen-api.sh._"; return 0; }

  local explicit resources
  explicit="$(grep -En '^[[:space:]]*(get|post|put|patch|delete)[[:space:]]+["'\'']' "$routes" 2>/dev/null || true)"
  resources="$(grep -En '^[[:space:]]*resources?[[:space:]]+:' "$routes" 2>/dev/null || true)"

  if [ -z "$explicit$resources" ]; then
    echo "_No routes parsed from \`$routes\`. (Mounted engines / constraints aren't extracted.)_"
    return 0
  fi
  echo "_Routes from [\`$routes\`](../$routes):_"
  echo
  echo "| Method | Path / Resource |"
  echo "|---|---|"
  # The outer grep is line-anchored (comment-safe); within each matched line
  # extract every verb+path occurrence so multiple routes on one line don't
  # collapse into a single fabricated row.
  printf '%s\n' "$explicit" | while IFS= read -r line; do
    [ -z "$line" ] && continue
    local content
    content="$(printf '%s' "$line" | cut -d: -f2-)"
    printf '%s' "$content" | grep -oE '(get|post|put|patch|delete)[[:space:]]+["'\''][^"'\'']+["'\'']' | while IFS= read -r occ; do
      [ -z "$occ" ] && continue
      local verb path
      verb="$(printf '%s' "$occ" | sed -E 's/^(get|post|put|patch|delete).*/\1/' | tr '[:lower:]' '[:upper:]')"
      path="$(printf '%s' "$occ" | sed -E 's/.*["'\'']([^"'\'']+)["'\''].*/\1/')"
      echo "| \`$verb\` | \`/$path\` |" | sed 's#//#/#'
    done
  done
  printf '%s\n' "$resources" | while IFS= read -r line; do
    [ -z "$line" ] && continue
    local kw name
    kw="$(printf '%s' "$line" | sed -E 's/.*(resources?)[[:space:]]+:.*/\1/')"
    name="$(printf '%s' "$line" | sed -E 's/.*resources?[[:space:]]+:([A-Za-z_]+).*/\1/')"
    if [ "$kw" = "resource" ]; then
      echo "| \`RESTful\` | \`resource :$name\` (show/create/update/destroy — singular) |"
    else
      echo "| \`RESTful\` | \`resources :$name\` (index/show/create/update/destroy) |"
    fi
  done
  return 0
}

lang_data() {
  local files; files="$(_rb_files)"
  [ -z "$files" ] && { echo "> **Database:** none detected."; return 0; }
  # Anchored to line start so a commented `# class Ghost < ApplicationRecord`
  # isn't counted as a live model.
  local models
  models="$(printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -EHn \
    '^[[:space:]]*class[[:space:]]+[A-Z][A-Za-z0-9_]*[[:space:]]*<[[:space:]]*(ApplicationRecord|ActiveRecord::Base)' \
    2>/dev/null || true)"
  if [ -z "$models" ]; then
    echo "> **Database:** No ActiveRecord models detected."
    echo
    echo "_If schema lives in \`db/schema.rb\`, reference it here and re-run gen-data.sh._"
    return 0
  fi
  echo "> **Database:** \`ActiveRecord\`"
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
    # Skip the abstract base class (a declaration, not an entity).
    case "$cls" in ApplicationRecord) continue ;; esac
    echo "| \`$cls\` | [\`$file\`](../$file) |"
  done
  return 0
}

lang_env_names() {
  local files; files="$(_rb_files)"
  [ -z "$files" ] && return 0
  printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -EhoI \
    'ENV(\.fetch)?[[:space:]]*[\[(][[:space:]]*["'\''][A-Z_][A-Z0-9_]*' 2>/dev/null \
    | grep -oE '[A-Z_][A-Z0-9_]*$' | sort -u || true
  return 0
}

lang_services() {
  [ -f Gemfile ] || return 0
  # Strip comments so a commented-out `# gem "stripe"` isn't read as active.
  local deps; deps="$(sed 's/#.*//' Gemfile 2>/dev/null)"
  _svc() { printf '%s' "$deps" | grep -qiE "$1" && echo "| **$2** | active | $3 | \`$4\` |"; return 0; }
  _svc "gem ['\"](pg|mysql2)"           'Database'              '`DATABASE_URL`'           'pg / mysql2'
  _svc "gem ['\"]redis"                  'Redis'                 '`REDIS_URL`'              'redis'
  _svc "gem ['\"]sidekiq"                'Sidekiq'               '`REDIS_URL`'              'sidekiq'
  _svc "gem ['\"]aws-sdk"                'AWS SDK'               '`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`' 'aws-sdk'
  _svc "gem ['\"]stripe"                 'Stripe'                '`STRIPE_SECRET_KEY`'      'stripe'
  _svc "gem ['\"]sendgrid"               'SendGrid'              '`SENDGRID_API_KEY`'       'sendgrid'
  _svc "gem ['\"]sentry"                 'Sentry'                '`SENTRY_DSN`'             'sentry-ruby'
  _svc "gem ['\"]devise"                 'Devise (auth)'         '`SECRET_KEY_BASE`'        'devise'
  unset -f _svc 2>/dev/null || true
  return 0
}
