// Regression tests for the publish review findings: tag publishing (H1), retained branches after
// explicit merges (M2), and no remote side effects from a blocked full sync (L1).
// Run after `npm --prefix git-service run build`: node --test git-service/tests/git-publish-review.test.mjs
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fx from './git-reliability-fixtures.mjs';

const sandbox = fx.createSandbox();
const { GitOperations, PublishError } = await import('../dist/git-operations.js');

const serviceLog = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && /^\[(Git|Validation)/.test(args[0])) return;
  serviceLog(...args);
};
after(() => sandbox.dispose());

const project = () => fx.seedProject(sandbox, 'p');
const caught = async (promise) => {
  try { await promise; } catch (error) { return error; }
  return assert.fail('expected the call to fail');
};
const remoteTags = (remote) => fx.git(remote, 'tag', '-l').split('\n').filter(Boolean).sort();
const leak = (name = 'notes.txt') => ({ name, content: `token = "${fx.FAKE_TOKEN}"\n` });
const blockedBy = (error, filePath) => error instanceof PublishError && error.outcome === 'blocked'
  && error.issues.some((issue) => issue.filePath === filePath && issue.severity === 'error');

function commitLeak(work, message = 'oops') {
  const { name, content } = leak();
  fx.write(work, name, content);
  return fx.commitAll(work, message);
}

describe('tag publishing validates like a branch push (H1)', () => {
  it('blocks a tag whose commit holds a credential file and pushes nothing', async () => {
    const { remote, work } = project();
    fx.write(work, '.env', `API_KEY=${fx.FAKE_TOKEN}\n`);
    fx.commitAll(work, 'oops');
    fx.git(work, 'tag', 'v1');
    const remoteBefore = fx.remoteHeads(remote);

    const error = await caught(new GitOperations(work).pushTag('v1'));
    assert.ok(blockedBy(error, '.env'));
    assert.match(error.message, /Publishing tag 'v1' blocked by validation/);
    assert.ok(!error.message.includes(fx.FAKE_TOKEN));
    assert.ok(!JSON.stringify(error.issues).includes(fx.FAKE_TOKEN));
    assert.deepEqual(remoteTags(remote), []);
    assert.equal(fx.remoteHeads(remote), remoteBefore);

    const forced = await caught(new GitOperations(work).pushTag('v1', { allowWarnings: true }));
    assert.ok(blockedBy(forced, '.env'), 'allowWarnings must not override an error');
    assert.deepEqual(remoteTags(remote), []);
  });

  it('inspects the tag target, not HEAD: an old secret commit blocks, an earlier clean commit does not', async () => {
    const { remote, work } = project();
    fx.write(work, 'clean.txt', 'clean\n');
    fx.commitAll(work, 'clean');
    fx.git(work, 'tag', 'early');
    commitLeak(work);
    fx.git(work, 'tag', 'leak');
    fx.git(work, 'rm', '-q', 'notes.txt');
    fx.git(work, 'commit', '-q', '-m', 'remove the secret');
    fx.git(work, 'tag', 'latest');
    const ops = new GitOperations(work);

    assert.ok(blockedBy(await caught(ops.pushTag('leak')), 'notes.txt'), 'tag on a non-HEAD secret commit');
    assert.ok(blockedBy(await caught(ops.pushTag('latest')), 'notes.txt'), 'the secret is still reachable from a later commit');
    assert.deepEqual(remoteTags(remote), []);

    await ops.pushTag('early');
    assert.deepEqual(remoteTags(remote), ['early']);
    assert.equal(fx.git(remote, 'rev-parse', 'early^{commit}'), fx.git(work, 'rev-parse', 'early^{commit}'));
  });

  it('blocks a secret introduced only by a merge conflict resolution', async () => {
    const { remote, work } = project();
    fx.write(work, 'shared.txt', 'one\ntwo\n');
    fx.commitAll(work, 'shared');
    fx.git(work, 'push', '-q');
    fx.git(work, 'checkout', '-q', '-b', 'side');
    fx.write(work, 'shared.txt', 'one\nSIDE\n');
    fx.commitAll(work, 'side edit');
    fx.git(work, 'checkout', '-q', 'trunk');
    fx.write(work, 'shared.txt', 'one\nTRUNK\n');
    fx.commitAll(work, 'trunk edit');
    assert.notEqual(fx.gitResult(work, ['merge', '--no-ff', '-m', 'merge side', 'side']).status, 0);
    fx.write(work, 'shared.txt', `one\nk = "${fx.FAKE_TOKEN}"\n`);
    fx.commitAll(work, 'merge side');
    fx.git(work, 'tag', 'merged');

    const error = await caught(new GitOperations(work).pushTag('merged'));
    assert.ok(blockedBy(error, 'shared.txt'));
    assert.deepEqual(remoteTags(remote), []);
  });

  it('validates every tag before pushing any: one blocked tag publishes none', async () => {
    const { remote, work } = project();
    fx.write(work, 'a.txt', 'a\n');
    fx.commitAll(work, 'a');
    fx.git(work, 'tag', 'ok1');
    fx.write(work, 'b.txt', 'b\n');
    fx.commitAll(work, 'b');
    fx.git(work, 'tag', '-a', 'ok2', '-m', 'second release');
    commitLeak(work);
    fx.git(work, 'tag', 'bad');
    const ops = new GitOperations(work);

    const error = await caught(ops.pushAllTags());
    assert.ok(blockedBy(error, 'notes.txt'));
    assert.match(error.message, /Publishing 3 tags blocked/);
    assert.deepEqual(remoteTags(remote), []);

    fx.git(work, 'tag', '-d', 'bad');
    await ops.pushAllTags();
    assert.deepEqual(remoteTags(remote), ['ok1', 'ok2']);
  });

  it('publishes a legitimate annotated tag as the same tag object, with its message', async () => {
    const { remote, work } = project();
    fx.write(work, 'feature.txt', 'feature\n');
    fx.commitAll(work, 'unpushed clean commit');
    fx.git(work, 'tag', '-a', 'v1.0', '-m', 'Release ✓ 1.0');
    const localObject = fx.git(work, 'rev-parse', 'refs/tags/v1.0');

    await new GitOperations(work).pushTag('v1.0');

    assert.equal(fx.git(remote, 'cat-file', '-t', 'refs/tags/v1.0'), 'tag');
    assert.equal(fx.git(remote, 'rev-parse', 'refs/tags/v1.0'), localObject);
    assert.match(fx.git(remote, 'tag', '-n1', '-l', 'v1.0'), /Release ✓ 1\.0/);
    assert.equal(fx.git(remote, 'rev-parse', 'v1.0^{commit}'), fx.head(work));
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.git(work, 'rev-parse', 'origin/trunk'), 'tag push does not move branches');
  });

  it('pushing the same tag again is a no-op, and a moved tag is rejected without force', async () => {
    const { remote, work } = project();
    fx.git(work, 'tag', 'v1');
    const ops = new GitOperations(work);
    await ops.pushTag('v1');
    await ops.pushTag('v1');

    fx.write(work, 'next.txt', 'n\n');
    fx.commitAll(work, 'next');
    fx.git(work, 'tag', '-f', 'v1');
    const error = await caught(ops.pushTag('v1'));
    assert.equal(error.outcome, 'push-failed');
    assert.match(error.message, /'v1' \(already exists\)/);
    assert.match(error.message, /never force-pushes tags/);
    assert.notEqual(fx.git(remote, 'rev-parse', 'refs/tags/v1'), fx.git(work, 'rev-parse', 'refs/tags/v1'));
  });

  it('screens annotated tag messages, including nested tag objects', async () => {
    const { remote, work } = project();
    fx.git(work, 'tag', '-a', 'inner', '-m', `token = "${fx.FAKE_TOKEN}"`);
    fx.git(work, 'tag', '-a', 'outer', '-m', 'clean message', fx.git(work, 'rev-parse', 'refs/tags/inner'));
    const ops = new GitOperations(work);

    const direct = await caught(ops.pushTag('inner'));
    assert.ok(blockedBy(direct, 'refs/tags/inner'));
    assert.ok(!direct.message.includes(fx.FAKE_TOKEN));
    const nested = await caught(ops.pushTag('outer'));
    assert.ok(blockedBy(nested, 'refs/tags/outer'), 'a credential in an inner tag object blocks the tag being pushed');
    assert.match(nested.message, /Possible credential/);
    assert.ok(!nested.message.includes(fx.FAKE_TOKEN));
    assert.deepEqual(remoteTags(remote), []);
  });

  it('requires allowWarnings for warning-level content, and only a real boolean counts', async () => {
    const { remote, work } = project();
    fx.write(work, 'debug.log', 'line\n');
    fx.commitAll(work, 'log file');
    fx.git(work, 'tag', 'logged');
    const ops = new GitOperations(work);

    const warned = await caught(ops.pushTag('logged'));
    assert.equal(warned.outcome, 'blocked');
    assert.deepEqual(warned.issues.map((issue) => issue.severity), ['warning']);
    assert.match(warned.message, /allowWarnings/);
    for (const bad of ['true', 1, 'yes']) {
      assert.match((await caught(ops.pushTag('logged', { allowWarnings: bad }))).message, /allowWarnings must be true or false/);
    }
    assert.match((await caught(ops.pushTag('logged', 'allow'))).message, /options must be an object/);
    assert.deepEqual(remoteTags(remote), []);

    await ops.pushTag('logged', { allowWarnings: true });
    assert.deepEqual(remoteTags(remote), ['logged']);
  });

  it('does not block on content the remote already has', async () => {
    const { remote, work } = project();
    commitLeak(work, 'already public');
    fx.git(work, 'push', '-q');
    fx.git(work, 'tag', 'public');
    await new GitOperations(work).pushTag('public');
    assert.deepEqual(remoteTags(remote), ['public']);
  });

  it('rejects invalid names and non-text input before touching the remote', async () => {
    const { remote, work } = project();
    fx.git(work, 'tag', 'v1');
    const ops = new GitOperations(work);
    for (const bad of ['--all', '-x', '../x', 'a b', 'a..b', '', 'x~1', 'v1.lock', 'a:b', 123, null, {}, ['v1']]) {
      const error = await caught(ops.pushTag(bad));
      assert.ok(error instanceof PublishError, `expected PublishError for ${JSON.stringify(bad)}`);
    }
    assert.match((await caught(ops.pushTag('missing'))).message, /does not exist/);
    assert.deepEqual(remoteTags(remote), []);
  });

  it('refuses the whole batch when any local tag has a name BitGit will not publish', async () => {
    const { remote, work } = project();
    fx.git(work, 'tag', 'v1');
    fx.git(work, 'update-ref', 'refs/tags/-weird', fx.head(work));
    const error = await caught(new GitOperations(work).pushAllTags());
    assert.match(error.message, /No tags were pushed/);
    assert.match(error.message, /-weird/);
    assert.deepEqual(remoteTags(remote), []);
  });

  it('refuses tags that do not point to a commit', async () => {
    const { remote, work } = project();
    fx.git(work, 'tag', 'v1');
    fx.git(work, 'tag', 'blob-tag', fx.git(work, 'rev-parse', 'HEAD:README.md'));
    const ops = new GitOperations(work);
    assert.match((await caught(ops.pushTag('blob-tag'))).message, /do not point to a commit/);
    assert.match((await caught(ops.pushAllTags())).message, /blob-tag/);
    assert.deepEqual(remoteTags(remote), []);
  });

  it('pushes more tags than fit in one batch', async () => {
    const { remote, work } = project();
    const commands = Array.from({ length: 130 }, (_, i) => `create refs/tags/t${i} ${fx.head(work)}\n`).join('');
    assert.equal(fx.gitResult(work, ['update-ref', '--stdin'], commands).status, 0);
    await new GitOperations(work).pushAllTags();
    assert.equal(remoteTags(remote).length, 130);
  });

  it('needs a configured remote and a repository', async () => {
    const dir = sandbox.dir('no-remote');
    fx.git(sandbox.root, 'init', '-q', '-b', 'trunk', dir);
    fx.write(dir, 'a.txt', 'a');
    fx.commitAll(dir, 'a');
    fx.git(dir, 'tag', 'v1');
    assert.match((await caught(new GitOperations(dir).pushTag('v1'))).message, /not configured/);
    const plain = sandbox.dir('plain');
    fx.write(plain, 'a.txt', 'a');
    assert.match((await caught(new GitOperations(plain).pushAllTags())).message, /not a Git repository/);
  });
});

describe('explicit merges keep their source branches (M2)', () => {
  function withFeature() {
    const { remote, work } = project();
    const other = fx.otherMachine(sandbox, remote);
    fx.git(other, 'checkout', '-q', '-b', 'feature');
    fx.write(other, 'feature.txt', 'feature\n');
    fx.commitAll(other, 'feature work');
    fx.git(other, 'push', '-q', 'origin', 'feature');
    return { remote, work, other };
  }

  it('keeps a remote feature branch that gains a commit right after the merge push', async () => {
    const { remote, work, other } = withFeature();
    fx.git(work, 'fetch', '-q');
    fx.git(work, 'branch', 'feature', 'origin/feature');
    const featureCommit = fx.git(remote, 'rev-parse', 'refs/heads/feature');
    const original = GitOperations.prototype.pushCurrent;
    GitOperations.prototype.pushCurrent = async function pushThenCollaborate(...args) {
      const result = await original.apply(this, args);
      fx.write(other, 'late.txt', 'late\n');
      fx.commitAll(other, 'late work');
      fx.git(other, 'push', '-q', 'origin', 'feature');
      return result;
    };
    let merged;
    try {
      merged = await new GitOperations(work).mergeBranches(['feature']);
    } finally {
      GitOperations.prototype.pushCurrent = original;
    }

    assert.deepEqual(merged, ['feature']);
    assert.equal(fx.git(remote, 'log', '-1', '--format=%s', 'refs/heads/feature'), 'late work');
    assert.equal(fx.git(remote, 'rev-parse', 'refs/heads/feature~1'), featureCommit);
    assert.match(fx.remoteHeads(remote), /refs\/heads\/trunk/);
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(work));
    assert.equal(fx.git(remote, 'rev-parse', 'trunk^2'), featureCommit);
    assert.equal(fx.git(work, 'rev-parse', 'refs/heads/feature'), featureCommit);
    assert.equal(fx.git(remote, 'ls-tree', '-r', '--name-only', 'trunk').includes('late.txt'), false);
  });

  it('never deletes a source branch, for merge or pull, when the merge is already complete', async () => {
    const { remote, work } = withFeature();
    const ops = new GitOperations(work);
    assert.deepEqual(await ops.mergeBranches(['feature']), ['feature']);
    assert.deepEqual(await ops.mergeBranches(['feature']), ['feature'], 'merging an already merged branch is a no-op, not a cleanup');
    assert.deepEqual(await ops.pullBranches(['feature']), ['feature']);
    assert.match(fx.remoteHeads(remote), /refs\/heads\/feature/);
  });
});

describe('a blocked full sync leaves the remote list alone (L1)', () => {
  function withoutRemote() {
    const dir = sandbox.dir('local-only');
    fx.git(sandbox.root, 'init', '-q', '-b', 'trunk', dir);
    fx.write(dir, 'a.txt', 'a\n');
    fx.commitAll(dir, 'first');
    return { dir, remote: fx.newBareRemote(sandbox, 'target') };
  }

  it('does not add origin when a selected file fails validation', async () => {
    const { dir, remote } = withoutRemote();
    fx.write(dir, '.env', 'K=1\n');
    const result = await new GitOperations(dir).fullSync(remote, undefined, undefined, { selectedFiles: ['.env'] });
    assert.equal(result.success, false);
    assert.equal(result.outcome, 'blocked');
    assert.equal(fx.git(dir, 'remote'), '');
    assert.equal(fx.remoteHeads(remote), '');
  });

  it('does not add origin when outgoing history holds a credential', async () => {
    const { dir, remote } = withoutRemote();
    commitLeak(dir);
    const result = await new GitOperations(dir).fullSync(remote);
    assert.equal(result.outcome, 'blocked');
    assert.ok(result.issues.some((issue) => issue.filePath === 'notes.txt'));
    assert.equal(fx.git(dir, 'remote'), '');
    assert.equal(fx.remoteHeads(remote), '');
  });

  it('does not add origin when the selection is invalid or missing', async () => {
    const { dir, remote } = withoutRemote();
    fx.write(dir, 'pending.txt', 'p\n');
    assert.equal((await new GitOperations(dir).fullSync(remote)).outcome, 'needs-selection');
    assert.equal((await new GitOperations(dir).fullSync(remote, undefined, undefined, { selectedFiles: ['nope.txt'] })).outcome, 'failed');
    assert.equal(fx.git(dir, 'remote'), '');
  });

  it('reports nothing to publish, without adding origin, when there are no commits', async () => {
    const dir = sandbox.dir('empty');
    fx.git(sandbox.root, 'init', '-q', '-b', 'trunk', dir);
    const remote = fx.newBareRemote(sandbox, 'target');
    const result = await new GitOperations(dir).fullSync(remote);
    assert.equal(result.success, false);
    assert.equal(result.outcome, 'failed');
    assert.match(result.message, /Nothing to publish/);
    assert.equal(fx.git(dir, 'remote'), '');
  });

  it('adds origin only after validation passes, then publishes and sets the upstream', async () => {
    const { dir, remote } = withoutRemote();
    fx.write(dir, 'b.txt', 'b\n');
    const result = await new GitOperations(dir).fullSync(remote, 'publish', undefined, { selectedFiles: ['b.txt'] });
    assert.equal(result.success, true);
    assert.equal(result.outcome, 'published');
    assert.equal(result.committed, 1);
    assert.equal(result.pushed, 2);
    assert.equal(fx.git(dir, 'remote', 'get-url', 'origin'), remote);
    assert.equal(fx.git(dir, 'rev-parse', '--abbrev-ref', '@{u}'), 'origin/trunk');
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(dir));
  });

  it('keeps the added origin, and says the push failed, when the remote rejects the push', async () => {
    const { dir, remote } = withoutRemote();
    const hook = join(remote, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\necho "policy says no" >&2\nexit 1\n');
    chmodSync(hook, 0o755);
    const result = await new GitOperations(dir).fullSync(remote);
    assert.equal(result.success, false);
    assert.equal(result.outcome, 'push-failed');
    assert.equal(result.pushed, 0);
    assert.match(result.errors[0], /policy says no/);
    assert.equal(fx.git(dir, 'remote', 'get-url', 'origin'), remote);
  });
});

describe('runtime publish options are validated', () => {
  it('rejects malformed options before anything changes', async () => {
    const { remote, work } = project();
    fx.write(work, 'a.txt', 'a\n');
    const ops = new GitOperations(work);
    const before = fx.remoteHeads(remote);
    for (const options of ['x', 7, ['allowWarnings'], { allowWarnings: 'true' }, { allowWarnings: 1 }, { selectedFiles: 'a.txt', allowWarnings: false }]) {
      assert.ok((await caught(ops.pushLocal(undefined, undefined, undefined, options))) instanceof PublishError, JSON.stringify(options));
      assert.ok((await caught(ops.validateBeforeSync(options))) instanceof PublishError, JSON.stringify(options));
    }
    const sync = await ops.fullSync(undefined, undefined, undefined, { allowWarnings: 'true' });
    assert.equal(sync.success, false);
    assert.match(sync.errors[0], /allowWarnings must be true or false/);
    assert.match((await caught(ops.mergeBranches(['x'], undefined, { allowWarnings: 'true' }))).message, /allowWarnings/);
    assert.equal(fx.remoteHeads(remote), before);
    assert.equal(fx.git(work, 'status', '--short'), '?? a.txt');
  });

  it('accepts absent, null and boolean values', async () => {
    const { work } = project();
    const ops = new GitOperations(work);
    for (const options of [undefined, null, {}, { allowWarnings: undefined }, { allowWarnings: null }, { allowWarnings: false }, { allowWarnings: true }]) {
      assert.deepEqual(await ops.pushLocal(undefined, undefined, undefined, options), { committed: 0, pushed: false });
    }
  });
});
