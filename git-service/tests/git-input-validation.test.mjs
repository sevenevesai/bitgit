import test from 'node:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createSandbox, seedProject } from './git-reliability-fixtures.mjs';
import { cloneRepository, addRemote, GitOperations } from '../dist/git-operations.js';

test('security validations prevent option and protocol injections', async t => {
  const sandbox = createSandbox();
  const dir = sandbox.dir('security-test');

  await t.test('cloneRepository rejects option injection and non-network protocols', async () => {
    // Malicious flags starting with hyphen
    await assert.rejects(
      () => cloneRepository('--upload-pack=touch /tmp/pwn', dir),
      /Invalid remote URL/
    );
    // Malicious git ext:: transport
    await assert.rejects(
      () => cloneRepository('ext::sh -c touch% /tmp/pwn', dir),
      /Invalid remote URL/
    );
    // File protocol or unapproved schemes
    await assert.rejects(
      () => cloneRepository('file:///etc/passwd', dir),
      /Use an HTTPS or SSH Git remote URL/
    );
    // Control characters in URL
    await assert.rejects(
      () => cloneRepository('https://github.com/foo/bar\n--upload-pack=calc', dir),
      /Invalid remote URL/
    );
  });

  await t.test('addRemote rejects option injection and invalid remote names', async () => {
    await assert.rejects(
      () => addRemote(dir, '--upload-pack=touch /tmp/pwn', 'https://github.com/foo/bar.git'),
      /Invalid remote name/
    );
    await assert.rejects(
      () => addRemote(dir, 'origin', 'ext::sh -c touch% /tmp/pwn'),
      /Invalid remote URL/
    );
    await assert.rejects(
      () => addRemote(dir, 'origin', '--upload-pack=touch /tmp/pwn'),
      /Invalid remote URL/
    );
  });

  await t.test('cloneRepository accepts only absolute destinations', async () => {
    await assert.rejects(() => cloneRepository('https://github.com/foo/bar.git', 'relative/dir'), /must be an absolute path/);
    await assert.rejects(() => cloneRepository('https://github.com/foo/bar.git', `${dir}/../x`), /must be an absolute path/);
  });

  await t.test('branch, tag and stash operations validate ref names and bounds', async () => {
    const { work } = seedProject(sandbox, 'sec-repo');
    const ops = new GitOperations(work);

    // switchBranch option injection
    await assert.rejects(
      () => ops.switchBranch('-f'),
      /Invalid branch name/
    );
    await assert.rejects(
      () => ops.switchBranch('branch with spaces'),
      /Invalid branch name/
    );

    // deleteBranch option injection
    await assert.rejects(
      () => ops.deleteBranch('--help'),
      /Invalid branch name/
    );

    // deleteTag option injection
    await assert.rejects(
      () => ops.deleteTag('-d'),
      /Invalid tag name/
    );

    await assert.rejects(() => ops.applyStash(-1), /Invalid stash index/);
    await assert.rejects(() => ops.dropStash(1.5), /Invalid stash index/);

    // createStash control chars
    await assert.rejects(
      () => ops.createStash('stash\x00message'),
      /Invalid stash message/
    );

    // getCommitHistory bounds check
    await assert.rejects(
      () => ops.getCommitHistory(0),
      /Commit history limit must be 1-1000/
    );
    await assert.rejects(
      () => ops.getCommitHistory(1001),
      /Commit history limit must be 1-1000/
    );
    await assert.rejects(
      () => ops.getCommitHistory(-5),
      /Commit history limit must be 1-1000/
    );

    // A stash message that looks like an option is stored as the message.
    writeFileSync(join(work, 'dirty.txt'), 'x\n');
    execFileSync('git', ['add', 'dirty.txt'], { cwd: work });
    await ops.createStash('--keep-index');
    const stashes = await ops.listStashes();
    assert.equal(stashes.length, 1);
    assert.match(stashes[0].message, /--keep-index/);
  });
});
