# Security Policy

## Supported versions

Until we cut a v1 release, only the latest commit on `main` is supported. Pre-1.0, expect breaking changes between minor versions.

| Version | Supported |
|---------|-----------|
| `main` (latest) | ✅ |
| Tagged pre-1.0 releases | ❌ — please upgrade |

## Reporting a vulnerability

**Please do not file a public GitHub issue for security vulnerabilities.**

Instead, use one of:

1. **GitHub Security Advisories** (preferred): https://github.com/intrepideai/docentic/security/advisories/new
2. **Email**: `clyde@intrepide.ai`

When reporting, please include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof of concept
- Affected version(s) (commit SHA if `main`)
- Your contact info for follow-up

## What to expect

- **Acknowledgement** within 72 hours
- **Initial assessment** within 7 days
- **Fix and disclosure timeline** agreed on with you before publishing
- **Credit** in the security advisory (unless you'd prefer to remain anonymous)

## Scope

In scope:
- The `docentic` CLI itself (anything under `src/`)
- The template files copied into target repos (`templates/`)
- The prompts shipped in the package (`prompts/`)
- The published npm artifact (when we publish)

Out of scope:
- Vulnerabilities in repos that have been scaffolded by `docentic` (file an issue with that repo)
- Vulnerabilities in upstream dependencies (`commander`, Node itself, etc.) — please report those upstream

## Hardening notes

- `docentic` makes no network requests during `docentic init` (pure local file ops + git/gh CLI invocations)
- It does not read or transmit secrets / environment variables
- It does not require elevated privileges
- The future `docentic populate` command will require an API key; that key is read from `.env` and sent only to the configured provider
