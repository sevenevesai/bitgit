import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { RecoveryService } from '../dist/recovery-service.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bitgit-metadata-'));
  const source = path.join(root, 'source');
  await fs.mkdir(source); await fs.writeFile(path.join(source, 'app.txt'), 'saved bytes\r\n');
  const service = new RecoveryService(source, { vaultRoot: path.join(root, 'vault') });
  const saved = await service.dispatch({ action: 'create', label: 'Intact snapshot' });
  t.after(async () => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'bitgit-metadata-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, source, service, saved };
}

test('damaged receipt annotations never hide or prevent recovery of intact code', async t => {
  const { root, service, saved } = await fixture(t);
  const file = service.metadataPath(saved.id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  for (const [index, bytes] of ['', 'null', '{', '{"evidence":{}}', '{"backup":{"verifiedAt":42}}'].entries()) {
    await fs.writeFile(file, bytes);
    const state = await service.dispatch({ action: 'state' });
    assert.equal(state.checkpoints.length, 1);
    assert.match(state.checkpoints[0].metadataError, /Saved files remain recoverable/);
    assert.deepEqual(state.checkpoints[0].evidence, []);
    assert.equal((await service.dispatch({ action: 'compare', checkpointId: saved.id })).unchangedCount, 1);
    const destination = path.join(root, `recovered-${index}`);
    const receipt = await service.dispatch({ action: 'recover', checkpointId: saved.id, destination });
    assert.match(receipt.warnings[0], /files were verified/);
    assert.equal(await fs.readFile(path.join(destination, 'app.txt'), 'utf8'), 'saved bytes\r\n');
    assert.equal(await fs.readFile(file, 'utf8'), bytes);
  }
});

test('unreadable metadata refuses commands and source mutations before any effects', async t => {
  const { root, source, service, saved } = await fixture(t);
  const file = service.metadataPath(saved.id), marker = path.join(root, 'should-not-exist');
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, '{');
  await fs.writeFile(path.join(source, 'app.txt'), 'current work');
  const comparison = await service.dispatch({ action: 'compare', checkpointId: saved.id });
  const requests = [
    { action: 'runCheck', checkpointId: saved.id, command: `node -e "require('fs').writeFileSync(${JSON.stringify(marker).replaceAll('"', "'")},'executed')"` },
    { action: 'repair', checkpointId: saved.id, paths: ['app.txt'], expectedFingerprint: comparison.currentFingerprint },
    { action: 'evidence', checkpointId: saved.id, description: 'cannot append', outcome: 'untested' },
    { action: 'backup', checkpointId: saved.id, remoteUrl: path.join(root, 'absent.git') },
  ];
  for (const request of requests) await assert.rejects(service.dispatch(request), /original metadata is preserved/);
  assert.equal(await fs.stat(marker).then(() => true, () => false), false);
  assert.equal(await fs.readFile(path.join(source, 'app.txt'), 'utf8'), 'current work');
  assert.equal(await fs.readFile(file, 'utf8'), '{');
  assert.equal((await service.dispatch({ action: 'state' })).checkpoints.length, 1);
});

test('damaged repair journal pauses writes while leaving history and new-copy recovery available', async t => {
  const { root, source, service, saved } = await fixture(t);
  const journal = path.join(service.vaultPath, 'pending-repair.json');
  for (const [index, bytes] of ['', '{', 'null', '{}', '{"entries":[null]}'].entries()) {
    await fs.writeFile(journal, bytes);
    const state = await service.dispatch({ action: 'state' });
    assert.ok(state.repairJournalError); assert.equal(state.checkpoints[0].id, saved.id);
    const destination = path.join(root, `journal-recovery-${index}`);
    await service.dispatch({ action: 'recover', checkpointId: saved.id, destination });
    assert.equal(await fs.readFile(path.join(destination, 'app.txt'), 'utf8'), 'saved bytes\r\n');
    for (const request of [{ action: 'create', label: 'refused' }, { action: 'autoTick' }, { action: 'repairRollback' },
      { action: 'repair', checkpointId: saved.id, paths: ['app.txt'], expectedFingerprint: saved.fingerprint }]) {
      await assert.rejects(service.dispatch(request), /journal/);
    }
    assert.equal(await fs.readFile(journal, 'utf8'), bytes);
  }
  assert.equal(await fs.readFile(path.join(source, 'app.txt'), 'utf8'), 'saved bytes\r\n');
});
