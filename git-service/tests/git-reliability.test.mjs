// Run after `npm --prefix git-service run build`: node --test git-service/tests/git-reliability.test.mjs
// Every scenario uses disposable repositories and bare local remotes with isolated Git configuration.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fx from './git-reliability-fixtures.mjs';

const sandbox = fx.createSandbox();
const { GitOperations, PublishError, BranchIntegrationError, pushToRemote } = await import('../dist/git-operations.js');

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
const blockedBy = (error, filePath) => error instanceof PublishError && error.outcome === 'blocked'
  && error.issues.some((issue) => issue.filePath === filePath && issue.severity === 'error');

// A project with tracked files ready for selection tests.
function tracked() {
  const p = project();
  fx.write(p.work, 'mod.txt', '1\n');
  fx.write(p.work, 'del.txt', 'd\n');
  fx.write(p.work, 'other.txt', 'o1\n');
  fx.write(p.work, 'partial.txt', 'p1\np2\np3\n');
  fx.commitAll(p.work, 'base');
  fx.git(p.work, 'push', '-q');
  return p;
}

describe('test isolation', () => {
  it('runs only against fixture Git configuration', () => {
    assert.equal(fx.git(sandbox.root, 'config', 'user.name'), 'Fixture User');
    assert.equal(fx.git(sandbox.root, 'config', 'core.autocrlf'), 'false');
    assert.notEqual(fx.gitResult(sandbox.root, ['config', '--get', 'filter.lfs.clean']).status, 0);
  });
});

describe('checkStatus', () => {
  it('reports a plain folder as not a repository without initializing Git', async () => {
    const dir = sandbox.dir('plain');
    fx.write(dir, 'note.txt', 'hi');
    const status = await new GitOperations(dir).checkStatus();
    assert.deepEqual(status, {
      isGitRepo: false, hasRemote: false, currentBranch: null, upstream: null, behindCommits: 0,
      remoteCheckedAt: null, remoteError: null, uncommittedFiles: 0, untrackedFiles: 0, modifiedFiles: [],
      unpushedCommits: 0, remoteBranches: [],
    });
    assert.equal(existsSync(join(dir, '.git')), false);
  });

  it('does not treat a folder inside another repository as a repository', async () => {
    const { work } = project();
    const inner = join(work, 'nested-folder');
    fx.write(work, 'nested-folder/file.txt', 'x');
    const status = await new GitOperations(inner).checkStatus();
    assert.equal(status.isGitRepo, false);
    assert.equal(existsSync(join(inner, '.git')), false);
  });

  it('populates every field for a repository without a remote', async () => {
    const dir = sandbox.dir('local-only');
    fx.git(sandbox.root, 'init', '-q', '-b', 'develop', dir);
    fx.write(dir, 'a.txt', 'a');
    fx.commitAll(dir, 'first');
    fx.write(dir, 'b.txt', 'b');
    const status = await new GitOperations(dir).checkStatus();
    assert.equal(status.isGitRepo, true);
    assert.equal(status.hasRemote, false);
    assert.equal(status.currentBranch, 'develop');
    assert.equal(status.upstream, null);
    assert.equal(status.behindCommits, 0);
    assert.equal(status.remoteCheckedAt, null);
    assert.equal(status.remoteError, null);
    assert.equal(status.untrackedFiles, 1);
    assert.equal(status.uncommittedFiles, 1);
    assert.deepEqual(status.modifiedFiles, ['b.txt']);
  });

  it('reports a behind-only repository as behind (F2)', async () => {
    const { remote, work } = project();
    const other = fx.otherMachine(sandbox, remote);
    fx.write(other, 'theirs.txt', 't');
    fx.commitAll(other, 'theirs');
    fx.git(other, 'push', '-q');
    const localHead = fx.head(work);
    const status = await new GitOperations(work).checkStatus();
    assert.equal(status.behindCommits, 1);
    assert.equal(status.unpushedCommits, 0);
    assert.equal(status.upstream, 'origin/trunk');
    assert.equal(status.currentBranch, 'trunk');
    assert.equal(status.remoteError, null);
    assert.ok(!Number.isNaN(Date.parse(status.remoteCheckedAt)));
    assert.equal(fx.head(work), localHead);
  });

  it('does not count the mere presence of remote branches as behind', async () => {
    const { remote, work } = project();
    const other = fx.otherMachine(sandbox, remote);
    fx.git(other, 'checkout', '-q', '-b', 'wip-experiment');
    fx.write(other, 'wip.txt', 'w');
    fx.commitAll(other, 'wip');
    fx.git(other, 'push', '-q', 'origin', 'wip-experiment');
    const status = await new GitOperations(work).checkStatus();
    assert.equal(status.behindCommits, 0);
    assert.equal(status.unpushedCommits, 0);
    assert.deepEqual(status.remoteBranches, ['wip-experiment']);
  });

  it('counts ahead and diverged commits against the actual upstream', async () => {
    const { remote, work } = project();
    fx.write(work, 'mine.txt', 'm');
    fx.commitAll(work, 'mine');
    let status = await new GitOperations(work).checkStatus();
    assert.deepEqual([status.unpushedCommits, status.behindCommits], [1, 0]);
    const other = fx.otherMachine(sandbox, remote);
    fx.write(other, 'theirs.txt', 't');
    fx.commitAll(other, 'theirs');
    fx.git(other, 'push', '-q');
    status = await new GitOperations(work).checkStatus();
    assert.deepEqual([status.unpushedCommits, status.behindCommits], [1, 1]);
  });

  it('exposes a failed fetch instead of hiding it, and never leaks URL credentials', async () => {
    const { work } = project();
    fx.write(work, 'mine.txt', 'm');
    fx.commitAll(work, 'mine');
    fx.git(work, 'remote', 'set-url', 'origin', 'http://user:hunter2@127.0.0.1:9/nope.git');
    const status = await new GitOperations(work).checkStatus();
    assert.equal(status.remoteCheckedAt, null);
    assert.ok(status.remoteError && status.remoteError.length > 0);
    assert.ok(!status.remoteError.includes('hunter2'));
    assert.equal(status.unpushedCommits, 1);
    assert.equal(status.behindCommits, 0);
    assert.equal(status.isGitRepo, true);
  });

  it('reports an upstream branch that no longer exists on the remote', async () => {
    const { remote, work } = project();
    fx.git(work, 'checkout', '-q', '-b', 'topic');
    fx.write(work, 't.txt', 't');
    fx.commitAll(work, 'topic');
    fx.git(work, 'push', '-q', '-u', 'origin', 'topic');
    fx.git(remote, 'branch', '-q', '-D', 'topic');
    const status = await new GitOperations(work).checkStatus();
    assert.equal(status.upstream, 'origin/topic');
    assert.match(status.remoteError, /no longer exists/);
  });

  it('reads a detached HEAD without switching branches or touching the index', async () => {
    const { work } = project();
    fx.write(work, 'staged.txt', 's');
    fx.git(work, 'add', 'staged.txt');
    fx.git(work, 'checkout', '-q', '--detach');
    const indexBefore = fx.indexBytes(work);
    const headBefore = fx.head(work);
    const status = await new GitOperations(work).checkStatus();
    assert.equal(status.currentBranch, null);
    assert.equal(status.upstream, null);
    assert.equal(status.uncommittedFiles, 1);
    assert.equal(fx.head(work), headBefore);
    assert.equal(fx.indexBytes(work), indexBefore);
    assert.equal(fx.git(work, 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD');
  });
});

describe('pushLocal: clean and unpushed commits', () => {
  it('pushes existing unpushed commits when the working tree is clean (F1)', async () => {
    const { remote, work } = project();
    fx.write(work, 'a.txt', 'a');
    fx.commitAll(work, 'local commit');
    const result = await new GitOperations(work).pushLocal();
    assert.deepEqual(result, { committed: 0, pushed: true });
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(work));
    assert.equal((await new GitOperations(work).checkStatus()).unpushedCommits, 0);
  });

  it('reports pushed:false when there is nothing to publish', async () => {
    const { remote, work } = project();
    const before = fx.remoteHeads(remote);
    assert.deepEqual(await new GitOperations(work).pushLocal(), { committed: 0, pushed: false });
    assert.equal(fx.remoteHeads(remote), before);
  });

  it('retries a push whose network step failed after the commit succeeded', async () => {
    const { remote, work } = project();
    fx.write(work, 'a.txt', 'a');
    fx.commitAll(work, 'local commit');
    fx.git(work, 'remote', 'set-url', 'origin', join(sandbox.root, 'missing.git'));
    const failure = await caught(new GitOperations(work).pushLocal());
    assert.equal(failure.outcome, 'push-failed');
    assert.notEqual(fx.git(remote, 'rev-parse', 'trunk'), fx.head(work));
    fx.git(work, 'remote', 'set-url', 'origin', remote);
    assert.deepEqual(await new GitOperations(work).pushLocal(), { committed: 0, pushed: true });
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(work));
  });

  it('publishes a branch that has no upstream yet and sets the upstream', async () => {
    const { remote, work } = project();
    fx.git(work, 'checkout', '-q', '-b', 'develop');
    fx.write(work, 'd.txt', 'd');
    fx.commitAll(work, 'develop work');
    const result = await new GitOperations(work).pushLocal();
    assert.equal(result.pushed, true);
    assert.equal(fx.git(remote, 'rev-parse', 'develop'), fx.head(work));
    assert.equal(fx.git(work, 'rev-parse', '--abbrev-ref', '@{u}'), 'origin/develop');
  });

  it('rejects a repository that is not initialized instead of initializing it', async () => {
    const dir = sandbox.dir('not-a-repo');
    fx.write(dir, 'a.txt', 'a');
    const error = await caught(new GitOperations(dir).pushLocal());
    assert.match(error.message, /not a Git repository/);
    assert.equal(existsSync(join(dir, '.git')), false);
  });
});

describe('pushLocal: file selection', () => {
  it('fails with a choose-files instruction instead of committing dirty work', async () => {
    const { remote, work } = tracked();
    fx.write(work, 'mod.txt', '2\n');
    fx.write(work, 'new.txt', 'n\n');
    const headBefore = fx.head(work);
    const indexBefore = fx.indexBytes(work);
    const remoteBefore = fx.remoteHeads(remote);
    const error = await caught(new GitOperations(work).pushLocal());
    assert.ok(error instanceof PublishError);
    assert.equal(error.outcome, 'needs-selection');
    assert.match(error.message, /Choose the files to commit/);
    assert.equal(fx.head(work), headBefore);
    assert.equal(fx.indexBytes(work), indexBefore);
    assert.equal(fx.remoteHeads(remote), remoteBefore);
    assert.match(fx.git(work, 'status', '--short'), /M mod\.txt/);
    assert.equal((await caught(new GitOperations(work).pushLocal(undefined, undefined, undefined, { selectedFiles: [] }))).outcome, 'needs-selection');
  });

  it('commits only the selected whole files and leaves other staged work intact', async () => {
    const { remote, work } = tracked();
    fx.write(work, 'mod.txt', '2\n');
    fx.git(work, 'rm', '-q', 'del.txt');
    fx.write(work, 'sp ace/ünï cödé.txt', 'unicode\n');
    fx.write(work, 'new file.txt', 'new\n');
    fx.write(work, 'unselected-untracked.txt', 'u\n');
    fx.write(work, 'other.txt', 'o2\n');
    fx.git(work, 'add', 'other.txt');
    fx.write(work, 'partial.txt', 'p1 staged\np2\np3\n');
    fx.git(work, 'add', 'partial.txt');
    fx.write(work, 'partial.txt', 'p1 staged\np2\np3 unstaged\n');
    const stagedPartial = fx.git(work, 'show', ':partial.txt');
    const stagedOther = fx.git(work, 'show', ':other.txt');

    const result = await new GitOperations(work).pushLocal(undefined, 'Selected ✓ files é', 'Only these', {
      selectedFiles: ['mod.txt', 'del.txt', 'sp ace/ünï cödé.txt', 'new file.txt'],
    });

    assert.deepEqual(result, { committed: 4, pushed: true });
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(work));
    const committed = fx.git(work, 'diff-tree', '--no-commit-id', '--name-only', '-r', '-z', '--no-renames', 'HEAD').split('\0').filter(Boolean).sort();
    assert.deepEqual(committed, ['del.txt', 'mod.txt', 'new file.txt', 'sp ace/ünï cödé.txt']);
    assert.match(fx.git(work, 'log', '-1', '--format=%B'), /Selected ✓ files é\s+Only these/);
    assert.equal(fx.git(work, 'show', ':other.txt'), stagedOther);
    assert.equal(fx.git(work, 'show', ':partial.txt'), stagedPartial);
    assert.equal(fx.git(work, 'diff', '--name-only'), 'partial.txt');
    assert.equal(fx.git(work, 'ls-files', '--others', '--exclude-standard'), 'unselected-untracked.txt');
    assert.equal(fx.git(work, 'diff', '--cached', '--name-only').split('\n').sort().join(','), 'other.txt,partial.txt');
  });

  it('leaves the index as it was when a commit hook rejects the commit', async () => {
    const { remote, work } = tracked();
    fx.write(work, 'new.txt', 'n\n');
    fx.write(work, 'other.txt', 'o2\n');
    fx.git(work, 'add', 'other.txt');
    const hook = join(work, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\necho "hook says no" >&2\nexit 1\n');
    chmodSync(hook, 0o755);
    const indexBefore = fx.indexBytes(work);
    const headBefore = fx.head(work);
    const remoteBefore = fx.remoteHeads(remote);
    const error = await caught(new GitOperations(work).pushLocal(undefined, undefined, undefined, { selectedFiles: ['new.txt'] }));
    assert.match(error.message, /hook says no/);
    assert.equal(error.committed, 0);
    assert.equal(fx.indexBytes(work), indexBefore);
    assert.equal(fx.head(work), headBefore);
    assert.equal(fx.remoteHeads(remote), remoteBefore);
    assert.match(fx.git(work, 'status', '--short'), /\?\? new\.txt/);
  });

  it('accepts Windows-style separators for a pending path', async () => {
    const { work } = project();
    fx.write(work, 'sub/file.txt', 'x');
    const result = await new GitOperations(work).pushLocal(undefined, undefined, undefined, { selectedFiles: ['sub\\file.txt'] });
    assert.deepEqual(result, { committed: 1, pushed: true });
  });

  it('rejects unknown, traversal, absolute, option-like and glob selections without committing', async () => {
    const { remote, work } = tracked();
    fx.write(work, 'mod.txt', '2\n');
    fx.write(work, 'a1.txt', '1');
    fx.write(work, 'a2.txt', '2');
    const headBefore = fx.head(work);
    const remoteBefore = fx.remoteHeads(remote);
    const bad = ['nope.txt', '../outside.txt', '..\\outside.txt', 'sub/../mod.txt', '/etc/passwd', 'C:\\Windows\\win.ini',
      '-rf', '--all', '', 'a\0b', '*.txt', 'mod.txt/', 'README.md', ':(top)mod.txt'];
    for (const selected of bad) {
      const error = await caught(new GitOperations(work).pushLocal(undefined, undefined, undefined, { selectedFiles: ['mod.txt', selected] }));
      assert.ok(error instanceof PublishError, `expected rejection for ${JSON.stringify(selected)}`);
      assert.equal(fx.head(work), headBefore);
    }
    assert.equal(fx.remoteHeads(remote), remoteBefore);
    assert.match(fx.git(work, 'status', '--short'), /M mod\.txt/);
  });

  it('rejects a mismatched origin URL without rewriting it', async () => {
    const { remote, work } = project();
    fx.write(work, 'a.txt', 'a');
    const error = await caught(new GitOperations(work).pushLocal('https://example.invalid/other/repo.git', undefined, undefined, { selectedFiles: ['a.txt'] }));
    assert.match(error.message, /does not rewrite an existing remote/);
    assert.equal(fx.git(work, 'remote', 'get-url', 'origin'), remote);
    assert.equal(fx.git(work, 'status', '--short'), '?? a.txt');
  });

  it('accepts an equivalent origin URL (credentials and .git suffix ignored)', async () => {
    const { work } = project();
    fx.git(work, 'remote', 'set-url', 'origin', 'http://127.0.0.1:9/example/repo.git');
    const url = 'http://token@127.0.0.1:9/example/repo/';
    fx.write(work, 'a.txt', 'a');
    // The port refuses connections: the call gets past the URL check and fails only at the push.
    const error = await caught(new GitOperations(work).pushLocal(url, undefined, undefined, { selectedFiles: ['a.txt'] }));
    assert.equal(error.outcome, 'push-failed');
    assert.ok(!error.message.includes('token@'));
    assert.equal(fx.git(work, 'remote', 'get-url', 'origin'), 'http://127.0.0.1:9/example/repo.git');
  });

  it('adds an absent origin as an explicit publish and sets the upstream', async () => {
    const remote = fx.newBareRemote(sandbox, 'fresh');
    const dir = sandbox.dir('fresh-work');
    fx.git(sandbox.root, 'init', '-q', '-b', 'trunk', dir);
    fx.write(dir, 'a.txt', 'a');
    const result = await new GitOperations(dir).pushLocal(remote, 'first', undefined, { selectedFiles: ['a.txt'] });
    assert.deepEqual(result, { committed: 1, pushed: true });
    assert.equal(fx.git(dir, 'remote', 'get-url', 'origin'), remote);
    assert.equal(fx.git(dir, 'rev-parse', '--abbrev-ref', '@{u}'), 'origin/trunk');
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(dir));
  });

  it('does not add the origin when validation fails', async () => {
    const remote = fx.newBareRemote(sandbox, 'fresh');
    const dir = sandbox.dir('fresh-work');
    fx.git(sandbox.root, 'init', '-q', '-b', 'trunk', dir);
    fx.write(dir, '.env', 'KEY=1\n');
    const error = await caught(new GitOperations(dir).pushLocal(remote, 'first', undefined, { selectedFiles: ['.env'] }));
    assert.ok(blockedBy(error, '.env'));
    assert.equal(fx.git(dir, 'remote'), '');
  });

  it('refuses to publish during an in-progress merge or on a detached HEAD', async () => {
    const { work } = project();
    writeFileSync(join(work, '.git', 'MERGE_HEAD'), `${fx.head(work)}\n`);
    assert.match((await caught(new GitOperations(work).pushLocal())).message, /merge is in progress/);
    rmSync(join(work, '.git', 'MERGE_HEAD'));
    fx.git(work, 'checkout', '-q', '--detach');
    assert.match((await caught(new GitOperations(work).pushLocal())).message, /detached/);
  });
});

describe('publish validation', () => {
  it('blocks a selected plain .env and keeps the commit and remote untouched (F4)', async () => {
    const { remote, work } = project();
    fx.write(work, '.env', `API_KEY=${fx.FAKE_TOKEN}\n`);
    const headBefore = fx.head(work);
    const remoteBefore = fx.remoteHeads(remote);
    const error = await caught(new GitOperations(work).pushLocal(undefined, undefined, undefined, { selectedFiles: ['.env'], allowWarnings: true }));
    assert.ok(blockedBy(error, '.env'));
    assert.ok(!error.message.includes(fx.FAKE_TOKEN));
    assert.ok(!JSON.stringify(error.issues).includes(fx.FAKE_TOKEN));
    assert.equal(error.committed, 0);
    assert.equal(fx.head(work), headBefore);
    assert.equal(fx.remoteHeads(remote), remoteBefore);
    assert.equal(fx.git(work, 'status', '--short'), '?? .env');
  });

  it('blocks a credential inside file content without echoing it', async () => {
    const { work } = project();
    fx.write(work, 'config.txt', `token = "${fx.FAKE_TOKEN}"\n`);
    const error = await caught(new GitOperations(work).pushLocal(undefined, undefined, undefined, { selectedFiles: ['config.txt'] }));
    assert.ok(blockedBy(error, 'config.txt'));
    assert.match(error.message, /Possible credential/);
    assert.ok(!error.message.includes(fx.FAKE_TOKEN));
  });

  it('ignores unselected working-tree secrets and preserves application lockfiles', async () => {
    const { remote, work } = project();
    fx.write(work, '.env', `KEY=${fx.FAKE_TOKEN}\n`);
    fx.write(work, 'package-lock.json', '{"lockfileVersion":3}\n');
    fx.write(work, 'yarn.lock', '# yarn lockfile v1\n');
    fx.write(work, 'Cargo.lock', '# lock\n');
    const result = await new GitOperations(work).pushLocal(undefined, undefined, undefined, {
      selectedFiles: ['package-lock.json', 'yarn.lock', 'Cargo.lock'],
    });
    assert.deepEqual(result, { committed: 3, pushed: true });
    assert.equal(fx.git(work, 'status', '--short'), '?? .env');
    assert.doesNotMatch(fx.git(remote, 'ls-tree', '-r', '--name-only', 'trunk'), /\.env/);
  });

  it('requires allowWarnings for warning-level files', async () => {
    const { remote, work } = project();
    fx.write(work, 'debug.log', 'line\n');
    fx.write(work, 'dist/app.js', 'x\n');
    const selectedFiles = ['debug.log', 'dist/app.js'];
    const headBefore = fx.head(work);
    const error = await caught(new GitOperations(work).pushLocal(undefined, undefined, undefined, { selectedFiles }));
    assert.equal(error.outcome, 'blocked');
    assert.deepEqual(error.issues.map((issue) => issue.severity), ['warning', 'warning']);
    assert.match(error.message, /allowWarnings/);
    assert.equal(fx.head(work), headBefore);
    const result = await new GitOperations(work).pushLocal(undefined, undefined, undefined, { selectedFiles, allowWarnings: true });
    assert.deepEqual(result, { committed: 2, pushed: true });
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(work));
  });

  it('blocks a selected file over 100 MiB even with allowWarnings', async () => {
    const { work } = project();
    writeFileSync(join(work, 'big.bin'), Buffer.alloc(100 * 1024 * 1024 + 1));
    const headBefore = fx.head(work);
    const error = await caught(new GitOperations(work).pushLocal(undefined, undefined, undefined, { selectedFiles: ['big.bin'], allowWarnings: true }));
    assert.ok(blockedBy(error, 'big.bin'));
    assert.match(error.message, /100MB limit/);
    assert.equal(fx.head(work), headBefore);
  });

  it('blocks a >100 MiB blob that is already committed locally', async () => {
    const { remote, work } = project();
    writeFileSync(join(work, 'big.bin'), Buffer.alloc(100 * 1024 * 1024 + 1));
    fx.commitAll(work, 'big');
    const remoteBefore = fx.remoteHeads(remote);
    const error = await caught(new GitOperations(work).pushLocal(undefined, undefined, undefined, { allowWarnings: true }));
    assert.ok(blockedBy(error, 'big.bin'));
    assert.equal(fx.remoteHeads(remote), remoteBefore);
  });

  it('blocks a secret in an outgoing committed blob even after a later commit deletes it', async () => {
    const { remote, work } = project();
    fx.write(work, 'notes.txt', `token = "${fx.FAKE_TOKEN}"\n`);
    fx.commitAll(work, 'oops');
    fx.git(work, 'rm', '-q', 'notes.txt');
    fx.git(work, 'commit', '-q', '-m', 'remove it');
    const remoteBefore = fx.remoteHeads(remote);
    const error = await caught(new GitOperations(work).pushLocal(undefined, undefined, undefined, { allowWarnings: true }));
    assert.ok(blockedBy(error, 'notes.txt'));
    assert.match(error.message, /unpushed commit/);
    assert.ok(!error.message.includes(fx.FAKE_TOKEN));
    assert.equal(fx.remoteHeads(remote), remoteBefore);
  });

  it('does not block on content that is already on the remote', async () => {
    const { remote, work } = project();
    fx.write(work, 'notes.txt', `token = "${fx.FAKE_TOKEN}"\n`);
    fx.commitAll(work, 'already public');
    fx.git(work, 'push', '-q');
    fx.write(work, 'clean.txt', 'clean\n');
    fx.commitAll(work, 'clean');
    assert.deepEqual(await new GitOperations(work).pushLocal(), { committed: 0, pushed: true });
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(work));
  });

  it('inspects the entire outgoing history, not a capped window', async () => {
    const { remote, work } = project();
    fx.fastImportCommits(work, 'trunk', 250, { 'leak.txt': `k = "${fx.FAKE_TOKEN}"\n` });
    const remoteBefore = fx.remoteHeads(remote);
    const error = await caught(new GitOperations(work).pushLocal());
    assert.ok(blockedBy(error, 'leak.txt'));
    assert.equal(fx.remoteHeads(remote), remoteBefore);
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
    const remoteBefore = fx.remoteHeads(remote);
    const error = await caught(new GitOperations(work).pushLocal());
    assert.ok(blockedBy(error, 'shared.txt'));
    assert.equal(fx.remoteHeads(remote), remoteBefore);
  });

  it('does not re-flag content that is already public when a clean merge is pushed', async () => {
    const { remote, work } = project();
    fx.git(work, 'checkout', '-q', '-b', 'side');
    fx.write(work, 'side.txt', 'side\n');
    fx.commitAll(work, 'side work');
    fx.git(work, 'checkout', '-q', 'trunk');
    fx.write(work, 'notes.txt', `token = "${fx.FAKE_TOKEN}"\n`);
    fx.commitAll(work, 'already public');
    fx.git(work, 'push', '-q');
    fx.git(work, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side');
    assert.deepEqual(await new GitOperations(work).pushLocal(), { committed: 0, pushed: true });
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(work));
  });

  it('lets a selected deletion of an already-tracked credential file through', async () => {
    const { remote, work } = project();
    fx.write(work, '.env', 'OLD=1\n');
    fx.commitAll(work, 'legacy commit');
    fx.git(work, 'push', '-q');
    fx.git(work, 'rm', '-q', '.env');
    const result = await new GitOperations(work).pushLocal(undefined, 'drop .env', undefined, { selectedFiles: ['.env'] });
    assert.deepEqual(result, { committed: 1, pushed: true });
    assert.doesNotMatch(fx.git(remote, 'ls-tree', '-r', '--name-only', 'trunk'), /\.env/);
  });

  it('validateBeforeSync reports the selection and outgoing history, not unrelated files', async () => {
    const { work } = project();
    fx.write(work, '.env', `A=${fx.FAKE_TOKEN}\n`);
    fx.write(work, 'ok.txt', 'ok\n');
    fx.write(work, 'debug.log', 'l\n');
    const ops = new GitOperations(work);

    const clean = await ops.validateBeforeSync({ selectedFiles: ['ok.txt'] });
    assert.deepEqual([clean.canProceed, clean.hasWarnings, clean.issues.length], [true, false, 0]);

    const withEnv = await ops.validateBeforeSync({ selectedFiles: ['.env', 'ok.txt'] });
    assert.equal(withEnv.canProceed, false);
    assert.equal(withEnv.issues[0].filePath, '.env');
    assert.equal(withEnv.issues[0].severity, 'error');
    assert.ok(withEnv.suggestedGitignore.includes('.env'));
    assert.ok(!JSON.stringify(withEnv).includes(fx.FAKE_TOKEN));

    const warned = await ops.validateBeforeSync({ selectedFiles: ['debug.log'] });
    assert.deepEqual([warned.canProceed, warned.hasWarnings], [true, true]);

    fx.git(work, 'add', 'ok.txt');
    fx.commitAll(work, 'commit everything, including the secret');
    const outgoing = await ops.validateBeforeSync();
    assert.equal(outgoing.canProceed, false);
    assert.ok(outgoing.issues.some((issue) => issue.filePath === '.env' && issue.severity === 'error'));
  });
});

describe('fullSync', () => {
  it('leaves unrelated remote branches alone (F5)', async () => {
    const { remote, work } = project();
    const other = fx.otherMachine(sandbox, remote);
    fx.git(other, 'checkout', '-q', '-b', 'wip-experiment');
    fx.write(other, 'experiment.txt', 'e');
    fx.commitAll(other, 'experiment');
    fx.git(other, 'push', '-q', 'origin', 'wip-experiment');
    const trunkBefore = fx.git(remote, 'rev-parse', 'trunk');

    const result = await new GitOperations(work).fullSync();

    assert.equal(result.success, true);
    assert.equal(result.outcome, 'up-to-date');
    assert.deepEqual(result.merged, []);
    assert.deepEqual(result.errors, []);
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), trunkBefore);
    assert.match(fx.remoteHeads(remote), /refs\/heads\/wip-experiment/);
    assert.equal(existsSync(join(work, 'experiment.txt')), false);
    assert.equal(fx.git(work, 'branch', '--format=%(refname:short)'), 'trunk');
  });

  it('does not report success for a conflicting branch; explicit merge fails and restores state (F3)', async () => {
    const { remote, work } = project();
    fx.write(work, 'shared.txt', 'one\ntwo\nthree\n');
    fx.commitAll(work, 'shared');
    fx.git(work, 'push', '-q');
    const other = fx.otherMachine(sandbox, remote);
    fx.git(other, 'checkout', '-q', '-b', 'feature');
    fx.write(other, 'shared.txt', 'one\nFEATURE\nthree\n');
    fx.commitAll(other, 'feature edit');
    fx.git(other, 'push', '-q', 'origin', 'feature');
    fx.write(work, 'shared.txt', 'one\nTRUNK\nthree\n');
    fx.commitAll(work, 'trunk edit');
    fx.git(work, 'push', '-q');
    const ops = new GitOperations(work);

    const sync = await ops.fullSync();
    assert.equal(sync.success, true);
    assert.deepEqual(sync.merged, []);

    const headBefore = fx.head(work);
    const remoteBefore = fx.remoteHeads(remote);
    const error = await caught(ops.mergeBranches(['feature']));
    assert.ok(error instanceof BranchIntegrationError);
    assert.equal(error.branch, 'feature');
    assert.equal(error.stage, 'merge');
    assert.deepEqual(error.conflicts, ['shared.txt']);
    assert.match(error.message, /'feature' conflicts in 1 file/);
    assert.equal(fx.git(work, 'status', '--porcelain'), '');
    assert.notEqual(fx.gitResult(work, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).status, 0);
    assert.equal(fx.head(work), headBefore);
    assert.equal(fx.remoteHeads(remote), remoteBefore);
  });

  it('fast-forwards a clean behind-only branch', async () => {
    const { remote, work } = project();
    const other = fx.otherMachine(sandbox, remote);
    fx.write(other, 'theirs.txt', 't');
    fx.commitAll(other, 'theirs');
    fx.git(other, 'push', '-q');
    const result = await new GitOperations(work).fullSync();
    assert.equal(result.success, true);
    assert.equal(result.outcome, 'fast-forwarded');
    assert.equal(result.pulled, 1);
    assert.equal(fx.head(work), fx.git(remote, 'rev-parse', 'trunk'));
    assert.equal(existsSync(join(work, 'theirs.txt')), true);
  });

  it('reports dirty-behind and needs-selection explicitly without touching the working tree', async () => {
    const { remote, work } = tracked();
    const other = fx.otherMachine(sandbox, remote);
    fx.write(other, 'theirs.txt', 't');
    fx.commitAll(other, 'theirs');
    fx.git(other, 'push', '-q');
    fx.write(work, 'mod.txt', 'local edit\n');
    const headBefore = fx.head(work);
    const ops = new GitOperations(work);

    const unselected = await ops.fullSync();
    assert.equal(unselected.success, false);
    assert.equal(unselected.outcome, 'needs-selection');
    assert.ok(unselected.errors.length > 0);

    const dirtyBehind = await ops.fullSync(undefined, undefined, undefined, { selectedFiles: ['mod.txt'] });
    assert.equal(dirtyBehind.success, false);
    assert.equal(dirtyBehind.outcome, 'dirty-behind');
    assert.equal(dirtyBehind.committed, 0);
    assert.equal(fx.head(work), headBefore);
    assert.match(fx.git(work, 'status', '--short'), /M mod\.txt/);
  });

  it('reports divergence without rebasing or merging', async () => {
    const { remote, work } = project();
    const other = fx.otherMachine(sandbox, remote);
    fx.write(other, 'theirs.txt', 't');
    fx.commitAll(other, 'theirs');
    fx.git(other, 'push', '-q');
    fx.write(work, 'mine.txt', 'm');
    fx.commitAll(work, 'mine');
    const headBefore = fx.head(work);
    const remoteBefore = fx.remoteHeads(remote);
    const result = await new GitOperations(work).fullSync();
    assert.equal(result.success, false);
    assert.equal(result.outcome, 'diverged');
    assert.match(result.errors[0], /diverged/);
    assert.equal(fx.head(work), headBefore);
    assert.equal(fx.remoteHeads(remote), remoteBefore);
    assert.equal(existsSync(join(work, '.git', 'rebase-merge')) || existsSync(join(work, '.git', 'rebase-apply')), false);
  });

  it('commits only the selection, pushes it and reports accurate counts', async () => {
    const { remote, work } = tracked();
    fx.write(work, 'mod.txt', '2\n');
    fx.write(work, 'stray.txt', 's\n');
    const result = await new GitOperations(work).fullSync(undefined, 'sync', undefined, { selectedFiles: ['mod.txt'] });
    assert.deepEqual(
      { success: result.success, outcome: result.outcome, committed: result.committed, pushed: result.pushed, merged: result.merged, errors: result.errors },
      { success: true, outcome: 'published', committed: 1, pushed: 1, merged: [], errors: [] },
    );
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(work));
    assert.equal(fx.git(work, 'status', '--short'), '?? stray.txt');
  });

  it('pushes existing unpushed commits and counts them', async () => {
    const { remote, work } = project();
    for (const name of ['a', 'b']) {
      fx.write(work, `${name}.txt`, name);
      fx.commitAll(work, name);
    }
    const result = await new GitOperations(work).fullSync();
    assert.equal(result.success, true);
    assert.equal(result.pushed, 2);
    assert.equal(result.committed, 0);
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(work));
  });

  it('publishes a new branch that has no upstream', async () => {
    const { remote, work } = project();
    fx.git(work, 'checkout', '-q', '-b', 'develop');
    fx.write(work, 'd.txt', 'd');
    fx.commitAll(work, 'develop');
    const result = await new GitOperations(work).fullSync();
    assert.equal(result.success, true);
    assert.equal(result.pushed, 1);
    assert.equal(fx.git(remote, 'rev-parse', 'develop'), fx.head(work));
  });

  it('fails closed with structured issues when validation blocks', async () => {
    const { remote, work } = project();
    fx.write(work, '.env', 'K=1\n');
    const remoteBefore = fx.remoteHeads(remote);
    const result = await new GitOperations(work).fullSync(undefined, undefined, undefined, { selectedFiles: ['.env'] });
    assert.equal(result.success, false);
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.committed, 0);
    assert.ok(result.issues.some((issue) => issue.filePath === '.env' && issue.severity === 'error'));
    assert.equal(fx.remoteHeads(remote), remoteBefore);
  });

  it('applies validation to commits that are already outgoing', async () => {
    const { remote, work } = project();
    fx.write(work, 'notes.txt', `k = "${fx.FAKE_TOKEN}"\n`);
    fx.commitAll(work, 'secret');
    const remoteBefore = fx.remoteHeads(remote);
    const result = await new GitOperations(work).fullSync();
    assert.equal(result.success, false);
    assert.equal(result.outcome, 'blocked');
    assert.ok(!result.errors.join('\n').includes(fx.FAKE_TOKEN));
    assert.equal(fx.remoteHeads(remote), remoteBefore);
  });

  it('reports a failed fetch as an explicit outcome and changes nothing', async () => {
    const { work } = project();
    fx.write(work, 'a.txt', 'a');
    fx.commitAll(work, 'local');
    fx.git(work, 'remote', 'set-url', 'origin', join(sandbox.root, 'missing.git'));
    const headBefore = fx.head(work);
    const result = await new GitOperations(work).fullSync();
    assert.equal(result.success, false);
    assert.equal(result.outcome, 'fetch-failed');
    assert.equal(result.pushed, 0);
    assert.equal(fx.head(work), headBefore);
  });

  it('reports a push rejected by the remote as push-failed with the commit kept locally', async () => {
    const { remote, work } = project();
    const hook = join(remote, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\necho "policy says no" >&2\nexit 1\n');
    chmodSync(hook, 0o755);
    fx.write(work, 'a.txt', 'a');
    const remoteBefore = fx.remoteHeads(remote);
    const result = await new GitOperations(work).fullSync(undefined, 'try', undefined, { selectedFiles: ['a.txt'] });
    assert.equal(result.success, false);
    assert.equal(result.outcome, 'push-failed');
    assert.equal(result.committed, 1);
    assert.equal(result.pushed, 0);
    assert.match(result.errors[0], /policy says no/);
    assert.equal(fx.remoteHeads(remote), remoteBefore);
    assert.equal(fx.git(work, 'log', '-1', '--format=%s'), 'try');
  });
});

describe('explicit branch integration', () => {
  function withFeature(files = { 'feature.txt': 'feature\n' }) {
    const { remote, work } = project();
    const other = fx.otherMachine(sandbox, remote);
    fx.git(other, 'checkout', '-q', '-b', 'feature');
    for (const [name, content] of Object.entries(files)) fx.write(other, name, content);
    fx.commitAll(other, 'feature work');
    fx.git(other, 'push', '-q', 'origin', 'feature');
    return { remote, work, other };
  }

  it('mergeBranches merges with --no-ff and pushes, keeping the source branches', async () => {
    const { remote, work } = withFeature();
    fx.git(work, 'fetch', '-q');
    fx.git(work, 'branch', 'feature', 'origin/feature');
    const featureBefore = fx.git(remote, 'rev-parse', 'refs/heads/feature');
    const merged = await new GitOperations(work).mergeBranches(['feature']);
    assert.deepEqual(merged, ['feature']);
    assert.equal(fx.git(work, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ').length, 3);
    assert.match(fx.git(work, 'log', '-1', '--format=%s'), /Merge branch 'feature'/);
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(work));
    assert.equal(fx.git(remote, 'rev-parse', 'refs/heads/feature'), featureBefore);
    assert.equal(fx.git(work, 'rev-parse', 'refs/heads/feature'), featureBefore);
    assert.equal(existsSync(join(work, 'feature.txt')), true);
  });

  it('pullBranches integrates and keeps the remote branch', async () => {
    const { remote, work } = withFeature();
    assert.deepEqual(await new GitOperations(work).pullBranches(['feature']), ['feature']);
    assert.match(fx.remoteHeads(remote), /refs\/heads\/feature/);
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(work));
  });

  it('reports a rejected push after a successful merge and leaves the remote unchanged', async () => {
    const { remote, work } = withFeature();
    const hook = join(remote, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\necho "policy says no" >&2\nexit 1\n');
    chmodSync(hook, 0o755);
    const remoteBefore = fx.remoteHeads(remote);
    const error = await caught(new GitOperations(work).mergeBranches(['feature']));
    assert.ok(error instanceof BranchIntegrationError);
    assert.equal(error.stage, 'push');
    assert.equal(error.branch, 'feature');
    assert.deepEqual(error.merged, []);
    assert.match(error.message, /policy says no/);
    assert.equal(fx.remoteHeads(remote), remoteBefore);
    assert.match(fx.remoteHeads(remote), /refs\/heads\/feature/);
  });

  it('reports one failing branch by name and lists what was already integrated', async () => {
    const { remote, work } = withFeature();
    const error = await caught(new GitOperations(work).pullBranches(['feature', 'missing']));
    assert.ok(error instanceof BranchIntegrationError);
    assert.equal(error.branch, 'missing');
    assert.equal(error.stage, 'preflight');
    assert.deepEqual(error.merged, ['feature']);
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(work));
  });

  it('refuses invalid names, dirty tracked files and merging a branch into itself', async () => {
    const { work } = withFeature();
    const ops = new GitOperations(work);
    await assert.rejects(ops.mergeBranches(['--all']), /Invalid branch name/);
    assert.equal((await caught(ops.mergeBranches(['trunk']))).stage, 'preflight');
    fx.write(work, 'README.md', 'dirty\n');
    const error = await caught(ops.mergeBranches(['feature']));
    assert.equal(error.stage, 'preflight');
    assert.match(error.message, /Uncommitted changes/);
  });

  it('validates before anything is merged when outgoing history is blocked', async () => {
    const { work } = withFeature();
    fx.write(work, 'notes.txt', `k = "${fx.FAKE_TOKEN}"\n`);
    fx.commitAll(work, 'secret');
    const headBefore = fx.head(work);
    const error = await caught(new GitOperations(work).mergeBranches(['feature']));
    assert.equal(error.stage, 'validation');
    assert.equal(fx.head(work), headBefore);
    assert.ok(!error.message.includes(fx.FAKE_TOKEN));
  });
});

describe('pushToRemote', () => {
  it('validates outgoing content before pushing, then pushes with upstream', async () => {
    const remote = fx.newBareRemote(sandbox, 'fresh');
    const dir = sandbox.dir('fresh-work');
    fx.git(sandbox.root, 'init', '-q', '-b', 'trunk', dir);
    fx.git(dir, 'remote', 'add', 'origin', remote);
    fx.write(dir, 'notes.txt', `k = "${fx.FAKE_TOKEN}"\n`);
    fx.commitAll(dir, 'secret');
    await assert.rejects(pushToRemote(dir, 'origin', 'trunk'), (error) => /blocked by validation/.test(error.message) && !error.message.includes(fx.FAKE_TOKEN));
    assert.equal(fx.remoteHeads(remote), '');

    const clean = sandbox.dir('clean-work');
    fx.git(sandbox.root, 'init', '-q', '-b', 'trunk', clean);
    fx.git(clean, 'remote', 'add', 'origin', remote);
    fx.write(clean, 'a.txt', 'a');
    fx.commitAll(clean, 'clean');
    await pushToRemote(clean, 'origin', 'trunk');
    assert.equal(fx.git(remote, 'rev-parse', 'trunk'), fx.head(clean));
    assert.equal(fx.git(clean, 'rev-parse', '--abbrev-ref', '@{u}'), 'origin/trunk');
  });

  it('rejects option-like names and unknown remotes', async () => {
    const { work } = project();
    await assert.rejects(pushToRemote(work, 'origin', '--all'), /Invalid branch name/);
    await assert.rejects(pushToRemote(work, 'nowhere', 'trunk'), /not configured/);
    await assert.rejects(pushToRemote(work, '--mirror', 'trunk'), /not configured/);
  });
});

describe('file changes and diffs', () => {
  function mixed() {
    const p = project();
    fx.write(p.work, 'staged only.txt', 's1\n');
    fx.write(p.work, 'unstaged.txt', 'u1\n');
    fx.write(p.work, 'partial.txt', 'p1\np2\n');
    fx.write(p.work, 'gone.txt', 'g\n');
    fx.commitAll(p.work, 'base');
    fx.write(p.work, 'staged only.txt', 's2\n');
    fx.git(p.work, 'add', 'staged only.txt');
    fx.write(p.work, 'unstaged.txt', 'u2\n');
    fx.write(p.work, 'partial.txt', 'p1 staged\np2\n');
    fx.git(p.work, 'add', 'partial.txt');
    fx.write(p.work, 'partial.txt', 'p1 staged\np2 unstaged\n');
    fx.git(p.work, 'rm', '-q', '--cached', 'gone.txt');
    fx.write(p.work, 'ünï untracked.txt', 'n1\nn2\n');
    writeFileSync(join(p.work, 'blob.bin'), Buffer.from([0, 1, 2, 3]));
    return p;
  }

  it('getFileChanges distinguishes staged, unstaged, partial and untracked paths', async () => {
    const changes = await new GitOperations(mixed().work).getFileChanges();
    const byPath = Object.fromEntries(changes.map((change) => [change.path, change]));
    assert.deepEqual([byPath['staged only.txt'].staged, byPath['staged only.txt'].unstaged], ['modified', null]);
    assert.deepEqual([byPath['unstaged.txt'].staged, byPath['unstaged.txt'].unstaged], [null, 'modified']);
    assert.deepEqual([byPath['partial.txt'].staged, byPath['partial.txt'].unstaged], ['modified', 'modified']);
    assert.equal(byPath['gone.txt'].staged, 'deleted');
    assert.equal(byPath['gone.txt'].untracked, true);
    assert.equal(byPath['ünï untracked.txt'].untracked, true);
    assert.equal(byPath['ünï untracked.txt'].staged, null);
  });

  it('getDiff labels staged, unstaged and untracked scopes and does not present unstaged-only data as complete', async () => {
    const ops = new GitOperations(mixed().work);
    const all = await ops.getDiff();
    const scopes = (name) => all.filter((diff) => diff.fileName === name).map((diff) => diff.scope).sort();
    assert.deepEqual(scopes('staged only.txt'), ['staged']);
    assert.deepEqual(scopes('unstaged.txt'), ['unstaged']);
    assert.deepEqual(scopes('partial.txt'), ['staged', 'unstaged']);
    assert.deepEqual(scopes('ünï untracked.txt'), ['untracked']);
    const untracked = all.find((diff) => diff.fileName === 'ünï untracked.txt');
    assert.deepEqual(untracked.changes.map((change) => [change.type, change.content]), [['add', 'n1'], ['add', 'n2']]);
    assert.equal(all.find((diff) => diff.fileName === 'blob.bin').binary, true);

    const stagedPartial = await ops.getDiff('partial.txt', 'staged');
    assert.equal(stagedPartial.length, 1);
    assert.ok(stagedPartial[0].changes.some((change) => change.type === 'add' && change.content === 'p1 staged'));
    assert.ok(!stagedPartial[0].changes.some((change) => change.content === 'p2 unstaged'));
    const unstagedPartial = await ops.getDiff('partial.txt', 'unstaged');
    assert.ok(unstagedPartial[0].changes.some((change) => change.type === 'add' && change.content === 'p2 unstaged'));
    assert.deepEqual(await ops.getDiff('does-not-exist.txt'), []);
  });

  it('getDiff rejects path injection', async () => {
    const ops = new GitOperations(mixed().work);
    for (const bad of ['--stat', '../x', '/etc/passwd']) await assert.rejects(ops.getDiff(bad), /Invalid file path/);
  });
});
