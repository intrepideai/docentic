// Lightweight JSON Schema validator for .agents/index.json.
//
// We do NOT pull in a full schema library (ajv) — that's a heavy runtime dep
// for one config file. Instead we hand-validate the fields we actually care
// about. Full schema validation is available via the standalone schema file
// at schemas/agents-index.schema.json (IDEs / external tools can use it).

export interface ValidationIssue {
  severity: 'error' | 'warning';
  path: string; // e.g. "docs[3].merge_policy"
  message: string;
}

const VALID_OWNERS = new Set(['human', 'generator', 'ai']);
const VALID_MERGE_POLICY = /^(auto|review|auto_delayed:\d+[hd])$/;
const SEMVER = /^\d+\.\d+\.\d+(-[\w.-]+)?$/;

// Mirror the published JSON schema's `additionalProperties: false` at the two
// levels that get hand-edited: the top-level object and each `docs[]` entry.
// (The schema also seals the nested `research`/`orchestration`/`health` objects;
// we don't re-check those here — they're rarely hand-authored.) Anything outside
// these sets is a typo or undocumented field that the schema rejects, so
// `docentic check` rejects it too rather than green-lighting an invalid index.
const ALLOWED_TOP_KEYS = new Set([
  '$schema', 'version', 'repo', 'product_name', 'stack', 'template_version',
  'updated', 'docs', 'sub_agents', 'research', 'seen_urls', 'orchestration', 'health',
]);
const ALLOWED_DOC_KEYS = new Set([
  'path', 'owner', 'edit_authority', 'merge_policy', 'source', 'critical',
  'anchor', 'size_limit_lines', 'auto_detected', 'trigger', 'hash', 'generated_hash',
]);

export function validateAgentsIndex(raw: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    issues.push({ severity: 'error', path: '$', message: 'root must be an object' });
    return issues;
  }
  const idx = raw as Record<string, unknown>;

  // Reject unknown top-level keys (schema: additionalProperties false).
  for (const key of Object.keys(idx)) {
    if (!ALLOWED_TOP_KEYS.has(key)) {
      issues.push({ severity: 'error', path: key, message: `unknown field — not allowed by the schema (additionalProperties: false)` });
    }
  }

  if (idx.version !== 1) {
    issues.push({ severity: 'error', path: 'version', message: `expected 1, got ${JSON.stringify(idx.version)}` });
  }
  if (typeof idx.repo !== 'string' || idx.repo.length === 0) {
    issues.push({ severity: 'error', path: 'repo', message: 'must be a non-empty string' });
  }
  if (idx.template_version !== undefined && (typeof idx.template_version !== 'string' || !SEMVER.test(idx.template_version))) {
    issues.push({ severity: 'error', path: 'template_version', message: `must be semver (e.g. 0.4.0); got ${JSON.stringify(idx.template_version)}` });
  }
  if (!Array.isArray(idx.docs)) {
    issues.push({ severity: 'error', path: 'docs', message: 'must be an array' });
    return issues; // Can't continue without docs array
  }

  // Validate each doc entry
  idx.docs.forEach((doc: unknown, i: number) => {
    const base = `docs[${i}]`;
    if (typeof doc !== 'object' || doc === null) {
      issues.push({ severity: 'error', path: base, message: 'must be an object' });
      return;
    }
    const d = doc as Record<string, unknown>;

    // Reject unknown doc-entry keys (schema DocEntry: additionalProperties false).
    for (const key of Object.keys(d)) {
      if (!ALLOWED_DOC_KEYS.has(key)) {
        issues.push({ severity: 'error', path: `${base}.${key}`, message: `unknown field — not allowed by the schema (additionalProperties: false)` });
      }
    }

    if (typeof d.path !== 'string' || d.path.length === 0) {
      issues.push({ severity: 'error', path: `${base}.path`, message: 'must be a non-empty string' });
    }
    if (typeof d.owner !== 'string' || !VALID_OWNERS.has(d.owner)) {
      issues.push({
        severity: 'error',
        path: `${base}.owner`,
        message: `must be one of human|generator|ai; got ${JSON.stringify(d.owner)}`,
      });
    }
    if (!Array.isArray(d.edit_authority) || d.edit_authority.length === 0) {
      issues.push({
        severity: 'error',
        path: `${base}.edit_authority`,
        message: 'must be a non-empty array',
      });
    } else {
      d.edit_authority.forEach((a: unknown, j: number) => {
        if (typeof a !== 'string' || !VALID_OWNERS.has(a)) {
          issues.push({
            severity: 'error',
            path: `${base}.edit_authority[${j}]`,
            message: `must be one of human|generator|ai; got ${JSON.stringify(a)}`,
          });
        }
      });
    }
    if (typeof d.merge_policy !== 'string' || !VALID_MERGE_POLICY.test(d.merge_policy)) {
      issues.push({
        severity: 'error',
        path: `${base}.merge_policy`,
        message: `must match /^(auto|review|auto_delayed:\\d+[hd])$/; got ${JSON.stringify(d.merge_policy)}`,
      });
    }
    if (d.owner === 'generator' && typeof d.source !== 'string') {
      issues.push({
        severity: 'error',
        path: `${base}.source`,
        message: 'owner:generator requires a source field pointing to the generator script',
      });
    }
  });

  // Optional but warned: orchestration model
  if (idx.orchestration !== undefined) {
    const o = idx.orchestration as Record<string, unknown>;
    const validModels = ['external_agent_invocation', 'ci_cron', 'manual_only', 'hybrid'];
    if (typeof o.model === 'string' && !validModels.includes(o.model)) {
      issues.push({
        severity: 'warning',
        path: 'orchestration.model',
        message: `unexpected value ${JSON.stringify(o.model)}; expected one of ${validModels.join('|')}`,
      });
    }
  }

  return issues;
}
