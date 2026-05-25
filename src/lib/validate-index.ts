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

export function validateAgentsIndex(raw: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    issues.push({ severity: 'error', path: '$', message: 'root must be an object' });
    return issues;
  }
  const idx = raw as Record<string, unknown>;

  if (idx.version !== 1) {
    issues.push({ severity: 'error', path: 'version', message: `expected 1, got ${JSON.stringify(idx.version)}` });
  }
  if (typeof idx.repo !== 'string' || idx.repo.length === 0) {
    issues.push({ severity: 'error', path: 'repo', message: 'must be a non-empty string' });
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
