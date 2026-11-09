import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkEnvironment } from './check-environment-protection.mjs';

const rule = (o = {}) => ({ type: 'required_reviewers', prevent_self_review: true, reviewers: [{ type: 'User' }], ...o });
const env = (rules, custom = true) => ({ protection_rules: rules, deployment_branch_policy: custom ? { protected_branches: false, custom_branch_policies: true } : null });
const tag = [{ type: 'tag', name: 'v*' }];

test('absent environment', () => assert.match(checkEnvironment(null, [])[0], /does not exist/));
test('no reviewer rule', () => assert.deepEqual(checkEnvironment(env([]), tag), ['no required reviewer']));
test('empty reviewers', () => assert.deepEqual(checkEnvironment(env([rule({ reviewers: [] })]), tag), ['no required reviewer']));
test('self-review allowed', () => assert.match(checkEnvironment(env([rule({ prevent_self_review: false })]), tag)[0], /self-review/));
test('no branch limit', () => assert.match(checkEnvironment(env([rule()], false), tag)[0], /not limited/));
test('no v* tag rule', () => assert.deepEqual(checkEnvironment(env([rule()]), [{ type: 'branch', name: 'v*' }]), ['no deployment tag rule "v*"']));
test('compliant', () => assert.deepEqual(checkEnvironment(env([rule()]), tag), []));
