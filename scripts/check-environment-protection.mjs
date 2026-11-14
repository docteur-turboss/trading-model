// Refuses a deploy / escrow-key check when the GitHub environment is not protected as RULES
// expects (docs/deployment/DEPLOY.md "Protect the production environment").
// Usage: node scripts/check-environment-protection.mjs <environment> [owner/repo]
// Needs `gh` and GH_TOKEN. production, staging, backup-key-check: errors, exit 1. Any other: warnings only.
// Writes exists=true|false to $GITHUB_OUTPUT when set (nothing when the API call fails).
//   node scripts/check-environment-protection.mjs --fork-approval [owner/repo]
// Refuses (error, exit 1, any environment) a deploy on the self-hosted runner unless fork pull
// request workflows need approval for every external contributor (issue #842,
// docs/deployment/STAGING_LOCAL.md "Runner isolation"). Unreadable setting: error too.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DOC = 'docs/deployment/DEPLOY.md';

const branch = (name) => ({ type: 'branch', name });
/**
 * Expected protection per environment. `reviewer`: 'strict' = reviewer + "Prevent self-review",
 * 'any' = at least one reviewer, absent = not required. `exact`: no deployment rule beyond `policies`.
 * Any other environment: production's reviewer rule, reported as warnings only.
 */
export const RULES = {
  production: { reviewer: 'strict', policies: [{ type: 'tag', name: 'v*' }] },
  staging: { policies: [branch('development'), branch('main')], exact: true },
  'backup-key-check': { reviewer: 'any', policies: [branch('main')], exact: true },
};
const FALLBACK = { reviewer: 'strict', policies: [] };

/**
 * @param {object|null} env GET /environments/{name} body, null when 404
 * @param {object[]} policies deployment-branch-policies entries
 * @param {{reviewer?: 'strict'|'any', policies: object[], exact?: boolean}} [rule] expected rule
 * @returns {string[]} problems, empty when compliant
 */
export function checkEnvironment(env, policies, rule = RULES.production) {
  if (!env) return [`the environment does not exist (GitHub would create it unprotected on first use)`];
  const problems = [];
  if (rule.reviewer) {
    const reviewers = (env.protection_rules ?? []).find((r) => r.type === 'required_reviewers');
    if (!reviewers || !(reviewers.reviewers ?? []).length) problems.push('no required reviewer');
    else if (rule.reviewer === 'strict' && !reviewers.prevent_self_review) problems.push('"Prevent self-review" is off');
  }
  if (!env.deployment_branch_policy?.custom_branch_policies) {
    problems.push('deployment branches are not limited to selected branches and tags');
    return problems;
  }
  const has = (list, w) => list.some((p) => p.type === w.type && p.name === w.name);
  for (const w of rule.policies) if (!has(policies, w)) problems.push(`no deployment ${w.type} rule "${w.name}"`);
  if (rule.exact) for (const p of policies) if (!has(rule.policies, p)) problems.push(`unexpected deployment ${p.type} rule "${p.name}"`);
  return problems;
}

const RUNNER_DOC = 'docs/deployment/STAGING_LOCAL.md (Runner isolation)';

/**
 * Fork pull requests can add a job on the persistent self-hosted runner: only an approval of
 * every external contributor's run stops one before it runs.
 * @param {object|null} body GET /repos/{owner}/{repo}/actions/permissions/fork-pr-contributor-approval body, null when 404
 * @returns {string[]} problems, empty when compliant
 */
export function checkForkApproval(body) {
  const policy = body?.approval_policy;
  if (policy === 'all_external_contributors') return [];
  return [`fork pull request workflows need approval for "${policy ?? 'unknown'}", not "all_external_contributors"`];
}

function api(path) {
  try {
    return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    if (/HTTP 404/.test(String(e.stderr))) return null;
    throw e; // 403/5xx: fail closed, never read as "compliant"
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [name, repo = process.env.GITHUB_REPOSITORY] = process.argv.slice(2);
  if (!name || !repo) {
    console.error('usage: check-environment-protection.mjs <environment>|--fork-approval [owner/repo]');
    process.exit(2);
  }
  if (name === '--fork-approval') {
    const problems = checkForkApproval(api(`repos/${repo}/actions/permissions/fork-pr-contributor-approval`));
    for (const p of problems) console.log(`::error::Repository ${repo}: ${p}. A fork could run code on the self-hosted runner. See ${RUNNER_DOC}.`);
    process.exit(problems.length ? 1 : 0);
  }
  const base = `repos/${repo}/environments/${name}`;
  const env = api(base);
  // deploy.yml preflight: a job naming a missing environment would create it unprotected.
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `exists=${env !== null}\n`);
  const policies = env ? (api(`${base}/deployment-branch-policies?per_page=100`)?.branch_policies ?? []) : [];
  const known = name in RULES;
  const problems = checkEnvironment(env, policies, RULES[name] ?? FALLBACK);
  const level = known ? 'error' : 'warning';
  for (const p of problems) console.log(`::${level}::GitHub environment '${name}': ${p}. See ${DOC} (Protect the production environment).`);
  process.exit(problems.length && known ? 1 : 0);
}
