// Refuses a production deploy when the GitHub environment is not protected
// (docs/deployment/DEPLOY.md "Protect the production environment").
// Usage: node scripts/check-environment-protection.mjs <environment> [owner/repo]
// Needs `gh` and GH_TOKEN. production: errors, exit 1. Any other environment: warnings only.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DOC = 'docs/deployment/DEPLOY.md';

/**
 * @param {object|null} env GET /environments/{name} body, null when 404
 * @param {object[]} policies deployment-branch-policies entries
 * @returns {string[]} problems, empty when compliant
 */
export function checkEnvironment(env, policies) {
  if (!env) return [`the environment does not exist (GitHub would create it unprotected on first use)`];
  const problems = [];
  const reviewers = (env.protection_rules ?? []).find((r) => r.type === 'required_reviewers');
  if (!reviewers || !(reviewers.reviewers ?? []).length) problems.push('no required reviewer');
  else if (!reviewers.prevent_self_review) problems.push('"Prevent self-review" is off');
  if (!env.deployment_branch_policy?.custom_branch_policies) {
    problems.push('deployment branches are not limited to selected branches and tags');
  } else if (!policies.some((p) => p.type === 'tag' && p.name === 'v*')) {
    problems.push('no deployment tag rule "v*"');
  }
  return problems;
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
    console.error('usage: check-environment-protection.mjs <environment> [owner/repo]');
    process.exit(2);
  }
  const base = `repos/${repo}/environments/${name}`;
  const env = api(base);
  const policies = env ? (api(`${base}/deployment-branch-policies`)?.branch_policies ?? []) : [];
  const problems = checkEnvironment(env, policies);
  const level = name === 'production' ? 'error' : 'warning';
  for (const p of problems) console.log(`::${level}::GitHub environment '${name}': ${p}. See ${DOC} (Protect the production environment).`);
  process.exit(problems.length && name === 'production' ? 1 : 0);
}
