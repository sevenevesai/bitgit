// Run after `npm --prefix git-service run build`: node --test git-service/tests/analytics-snapshot.test.mjs
// Every scenario uses disposable repositories and bare local remotes with isolated Git configuration.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import * as fx from './git-reliability-fixtures.mjs';

const sandbox = fx.createSandbox();
const { getAnalyticsSnapshots } = await import('../dist/git-operations.js');
after(() => sandbox.dispose());

const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const params = { historySince: day(-90), recentSince: day(-30), recentLimit: 30 };
const snapshotOf = async (repoPath) => {
  const [result] = await getAnalyticsSnapshots([repoPath], params);
  assert.equal(result.error, undefined);
  return result.snapshot;
};
const allRefs = (cwd) => fx.git(cwd, 'for-each-ref', '--format=%(refname) %(objectname)');

describe('analytics snapshot', () => {
  it('reports commits, branches, tags and stashes from local data', async () => {
    const { work } = fx.seedProject(sandbox, 'full');
    fx.write(work, 'notes.txt', 'one\ntwo\nthree\n');
    fx.commitAll(work, 'add notes');
    fx.git(work, 'tag', 'v1');
    fx.git(work, 'branch', 'feature/HEADER-cleanup');
    fx.write(work, 'notes.txt', 'changed\n');
    fx.git(work, 'stash');

    const snapshot = await snapshotOf(work);

    assert.equal(snapshot.commitDates.length, 2);
    assert.deepEqual(snapshot.recentCommits.map((c) => c.message), ['add notes', 'initial']);
    assert.deepEqual(
      { files: snapshot.recentCommits[0].filesChanged, additions: snapshot.recentCommits[0].additions, deletions: snapshot.recentCommits[0].deletions },
      { files: 1, additions: 3, deletions: 0 },
    );
    assert.equal(snapshot.recentCommits[0].hash, fx.head(work));
    assert.deepEqual(
      snapshot.branches.map((b) => `${b.isRemote ? 'remote' : 'local'}:${b.name}`).sort(),
      ['local:feature/HEADER-cleanup', 'local:trunk', 'remote:trunk'],
    );
    assert.ok(snapshot.branches.every((b) => b.daysSinceLastCommit === 0));
    assert.equal(snapshot.daysSinceLastCommit, 0);
    assert.equal(snapshot.tagCount, 1);
    assert.equal(snapshot.stashCount, 1);
  });

  it('never fetches: remote-tracking refs stay as the last fetch left them', async () => {
    const { remote, work } = fx.seedProject(sandbox, 'nofetch');
    const other = fx.otherMachine(sandbox, remote);
    fx.write(other, 'elsewhere.txt', 'pushed from another machine\n');
    fx.commitAll(other, 'remote work');
    fx.git(other, 'push', '-q', 'origin', 'trunk');
    const before = allRefs(work);

    const snapshot = await snapshotOf(work);

    assert.equal(allRefs(work), before);
    assert.equal(snapshot.branches.find((b) => b.isRemote).lastCommitHash, fx.head(work));
  });

  it('describes a repository without commits as empty', async () => {
    const empty = sandbox.dir('empty');
    fx.git(sandbox.root, 'init', '-q', empty);

    const snapshot = await snapshotOf(empty);

    assert.deepEqual(snapshot, { commitDates: [], recentCommits: [], branches: [], daysSinceLastCommit: null, tagCount: 0, stashCount: 0 });
  });

  it('excludes commits older than the requested windows', async () => {
    const { work } = fx.seedProject(sandbox, 'window');
    const [result] = await getAnalyticsSnapshots([work], { historySince: day(2), recentSince: day(2), recentLimit: 30 });

    assert.deepEqual(result.snapshot.commitDates, []);
    assert.deepEqual(result.snapshot.recentCommits, []);
    assert.equal(result.snapshot.daysSinceLastCommit, 0);
  });

  it('isolates an unreadable repository and keeps the request order', async () => {
    const { work } = fx.seedProject(sandbox, 'good');
    const plain = sandbox.dir('plain');
    mkdirSync(plain);

    const results = await getAnalyticsSnapshots([plain, work], params);

    assert.deepEqual(results.map((r) => r.repoPath), [plain, work]);
    assert.equal(typeof results[0].error, 'string');
    assert.equal(results[0].snapshot, undefined);
    assert.equal(results[1].snapshot.commitDates.length, 1);
  });

  it('rejects malformed parameters before running git', async () => {
    await assert.rejects(getAnalyticsSnapshots([], { ...params, historySince: '--output=x' }), /YYYY-MM-DD/);
    await assert.rejects(getAnalyticsSnapshots([], { ...params, recentLimit: 0 }), /recentLimit/);
    await assert.rejects(getAnalyticsSnapshots('not-an-array', params), /array/);
  });
});
