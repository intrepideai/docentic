#!/usr/bin/env bash
# lang/python.sh — Python adapter for the llm-docs generators.
#
# Sourced by gen-*.sh when detect-stack.sh reports LANGUAGE=python. Provides the
# generator contract:
#   lang_stack       — STACK.md body (source-of-truth line + repo/runtime/deps)
#   lang_api         — API.md endpoint inventory (FastAPI / Flask / Django)
#   lang_data        — DATA.md entities (SQLAlchemy / Django models)
#   lang_env_names   — env var names referenced under SRC_DIRS (one per line)
#   lang_services    — INTEGRATIONS.md "Detected services" table rows
#
# All functions are best-effort static scans and ALWAYS return 0 — they must
# never abort the caller (the generators run under `set -euo pipefail`).

# Python source files under SRC_DIRS (or repo root), excluding virtualenvs.
_py_files() {
  local dirs="${SRC_DIRS:-.}"
  [ -z "$dirs" ] && dirs="."
  # shellcheck disable=SC2086
  find $dirs -type f -name '*.py' \
    -not -path '*/.venv/*' -not -path '*/venv/*' -not -path '*/env/*' \
    -not -path '*/site-packages/*' -not -path '*/__pycache__/*' \
    -not -path '*/node_modules/*' 2>/dev/null | sort
}

# First capture group of an `^key = "value"` line in the manifest.
_toml_field() {
  [ -f "$MANIFEST" ] || return 0
  grep -E "^[[:space:]]*$1[[:space:]]*=" "$MANIFEST" 2>/dev/null | head -1 \
    | sed -E "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*[\"']?([^\"']*)[\"']?.*/\1/" || true
}

lang_stack() {
  local name version pyreq
  name="$(_toml_field name)"
  version="$(_toml_field version)"
  pyreq="$(_toml_field requires-python)"
  [ -n "$MANIFEST" ] && echo "> **Source of truth:** [\`$MANIFEST\`](../$MANIFEST)"
  cat <<EOF

## Repo

| Field | Value |
|---|---|
| Name | \`${name:-—}\` |
| Version | \`${version:-—}\` |
| Package manager | \`${PACKAGE_MANAGER:-pip}\` |

## Runtime

| Component | Version |
|---|---|
| Python | \`${pyreq:-(see $MANIFEST)}\` |

## Key dependencies
EOF
  echo
  # Prefer an explicit requirements.txt; fall back to pyproject dependency lines.
  local listed=""
  if [ -f requirements.txt ]; then
    listed="$(grep -vE '^[[:space:]]*(#|-|$)' requirements.txt 2>/dev/null \
      | sed -E 's/[[:space:]]*[#;].*$//; s/[[:space:]]*(==|>=|~=|!=|<|>).*$//; s/\[[a-z,]+\]//; s/[[:space:]]//g' \
      | grep -vE '^$' | sort -u | head -20 || true)"
  elif [ -f "$MANIFEST" ]; then
    # Section-aware: names under [tool.poetry(.group.*).dependencies], and names
    # inside a PEP 621 `dependencies = [ "pkg>=x", … ]` array.
    listed="$(awk '
      /^\[tool\.poetry(\.group\.[A-Za-z0-9_]+)?\.dependencies\]/ { mode="dep"; next }
      /^\[/ { mode="" }
      mode=="dep" && /=/ { n=$1; gsub(/[^A-Za-z0-9_.-]/,"",n); if (n!="" && n!="python") print n; next }
      /^[[:space:]]*dependencies[[:space:]]*=[[:space:]]*\[/ { arr=1 }
      arr {
        s=$0
        while (match(s, /"[A-Za-z0-9_.-]+/)) {
          d=substr(s, RSTART+1, RLENGTH-1); print d
          s=substr(s, RSTART+RLENGTH)
        }
      }
      arr && /\]/ { arr=0 }
    ' "$MANIFEST" 2>/dev/null | sort -u | head -20 || true)"
  fi
  if [ -n "$listed" ]; then
    echo '```'
    printf '%s\n' "$listed"
    echo '```'
  else
    echo "_No dependency list parsed — see [\`$MANIFEST\`](../$MANIFEST)._"
  fi
  return 0
}

lang_api() {
  local files; files="$(_py_files)"
  [ -z "$files" ] && { echo "_No Python source files found under \`${SRC_DIRS:-.}\`._"; return 0; }

  # FastAPI / Flask decorator routes: @app.get("/x"), @router.post("/y"), …
  local deco
  deco="$(printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -EHn \
    '@[A-Za-z_][A-Za-z0-9_]*\.(get|post|put|patch|delete)\(' 2>/dev/null || true)"
  # Flask classic: @app.route("/x", methods=[...])
  local flask
  flask="$(printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -EHn \
    '@[A-Za-z_][A-Za-z0-9_]*\.route\(' 2>/dev/null || true)"
  # Django URLConf: one match per path(...)/re_path(...) occurrence (handles
  # several per line), restricted to urls.py files.
  # Allow the raw-string prefix on re_path(r"^…$") — the form it almost always
  # takes — so those routes aren't silently dropped.
  local django
  django="$(printf '%s\n' "$files" | grep -E 'urls?\.py$' | tr '\n' '\0' | xargs -0 grep -EHo \
    '(path|re_path)\([[:space:]]*[rR]?["'"'"'][^"'"'"']*["'"'"']' 2>/dev/null || true)"

  if [ -n "$deco$flask" ]; then
    echo "| Method | Path | File |"
    echo "|---|---|---|"
    printf '%s\n' "$deco" | while IFS= read -r line; do
      [ -z "$line" ] && continue
      local file method path
      file="$(printf '%s' "$line" | cut -d: -f1)"; file="${file#./}"
      method="$(printf '%s' "$line" | sed -E 's/.*\.(get|post|put|patch|delete)\(.*/\1/' | tr '[:lower:]' '[:upper:]')"
      path="$(printf '%s' "$line" | sed -E 's/.*\.(get|post|put|patch|delete)\([[:space:]]*["'"'"']([^"'"'"']*)["'"'"'].*/\2/')"
      [ "$path" = "$line" ] && path="(dynamic)"
      echo "| \`$method\` | \`$path\` | [\`$file\`](../$file) |"
    done
    printf '%s\n' "$flask" | while IFS= read -r line; do
      [ -z "$line" ] && continue
      local file path
      file="$(printf '%s' "$line" | cut -d: -f1)"; file="${file#./}"
      path="$(printf '%s' "$line" | sed -E 's/.*\.route\([[:space:]]*["'"'"']([^"'"'"']*)["'"'"'].*/\1/')"
      [ "$path" = "$line" ] && continue
      echo "| \`*\` | \`$path\` | [\`$file\`](../$file) |"
    done
  elif [ -n "$django" ]; then
    echo "_Django URLConf entries (HTTP method is declared in the view):_"
    echo
    echo "| Path | urls.py |"
    echo "|---|---|"
    printf '%s\n' "$django" | while IFS= read -r line; do
      [ -z "$line" ] && continue
      local file path
      file="$(printf '%s' "$line" | cut -d: -f1)"; file="${file#./}"
      path="$(printf '%s' "$line" | sed -E 's/.*["'"'"']([^"'"'"']*)["'"'"'].*/\1/')"
      [ "$path" = "$line" ] && continue
      echo "| \`/$path\` | [\`$file\`](../$file) |"
    done
  else
    echo "_No FastAPI/Flask/Django routes detected under \`${SRC_DIRS:-.}\`. If this service exposes an API another way, document it here and re-run gen-api.sh._"
  fi
  return 0
}

lang_data() {
  local files; files="$(_py_files)"
  [ -z "$files" ] && { echo "> **Database:** none detected."; return 0; }

  # SQLAlchemy: class X(Base)/(db.Model); Django: class X(models.Model).
  # Anchored to line start (allowing indentation) so commented-out classes
  # (`# class Ghost(Base)`) aren't counted as live models.
  local models
  models="$(printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -EHn \
    '^[[:space:]]*class[[:space:]]+[A-Za-z_][A-Za-z0-9_]*\(([A-Za-z_.]*Base|db\.Model|models\.Model)' 2>/dev/null || true)"
  if [ -z "$models" ]; then
    echo "> **Database:** No SQLAlchemy/Django models detected."
    echo
    echo "_Add ORM models (or document raw SQL) and re-run gen-data.sh._"
    return 0
  fi
  local orm="SQLAlchemy"
  printf '%s' "$models" | grep -q 'models\.Model' && orm="Django ORM"
  echo "> **Database:** \`$orm\`"
  echo
  echo "## Models"
  echo
  echo "| Model | File |"
  echo "|---|---|"
  printf '%s\n' "$models" | while IFS= read -r line; do
    [ -z "$line" ] && continue
    local file cls
    file="$(printf '%s' "$line" | cut -d: -f1)"; file="${file#./}"
    cls="$(printf '%s' "$line" | sed -E 's/.*class[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\1/')"
    # Skip the ORM base class itself (it's a declaration, not an entity).
    case "$cls" in Base|BaseModel|AbstractBaseModel|AbstractUser) continue ;; esac
    echo "| \`$cls\` | [\`$file\`](../$file) |"
  done
  return 0
}

lang_env_names() {
  local files; files="$(_py_files)"
  [ -z "$files" ] && return 0
  # os.environ["X"], os.environ.get("X"), os.getenv("X"), getenv("X")
  printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -EhoI \
    "(os\.environ(\.get)?\(?\[?|getenv\()[[:space:]]*[\"'][A-Z_][A-Z0-9_]*" 2>/dev/null \
    | grep -oE "[A-Z_][A-Z0-9_]*$" | sort -u || true
  return 0
}

lang_services() {
  [ -f requirements.txt ] || [ -f "$MANIFEST" ] || return 0
  # Strip comments (`# …`) before matching so a dependency named only in a
  # comment ("# TODO: evaluate stripe") never renders as an active service.
  local deps=""
  [ -f requirements.txt ] && deps="$(sed 's/#.*//' requirements.txt 2>/dev/null)"
  [ -f "$MANIFEST" ] && deps="$deps
$(sed 's/#.*//' "$MANIFEST" 2>/dev/null)"
  _svc() { printf '%s' "$deps" | grep -qiE "$1" && echo "| **$2** | active | $3 | \`$4\` |"; return 0; }
  _svc 'psycopg|asyncpg|sqlalchemy'      'PostgreSQL / SQLAlchemy' '`DATABASE_URL`'           'sqlalchemy'
  _svc 'boto3'                            'AWS (boto3)'             '`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`' 'boto3'
  _svc '(^|[^a-z[])redis'                 'Redis'                   '`REDIS_URL`'              'redis'
  _svc 'stripe'                           'Stripe'                  '`STRIPE_SECRET_KEY`'      'stripe'
  _svc 'anthropic'                        'Anthropic'              '`ANTHROPIC_API_KEY`'      'anthropic'
  _svc 'openai'                           'OpenAI'                 '`OPENAI_API_KEY`'         'openai'
  _svc 'celery'                           'Celery'                 '`CELERY_BROKER_URL`'      'celery'
  _svc 'sentry'                           'Sentry'                 '`SENTRY_DSN`'             'sentry-sdk'
  unset -f _svc 2>/dev/null || true
  return 0
}
