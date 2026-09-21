import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
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

test('redaction expansion cannot invalidate a check receipt', async t => {
  const { service, saved } = await fixture(t);
  const command = `echo ${'://a:b@ '.repeat(496)}`;
  assert.ok(command.length < 4000);
  const entry = await service.dispatch({ action: 'runCheck', checkpointId: saved.id, command });
  t.after(async () => {
    const holder = path.dirname(entry.workingCopyPath);
    assert.ok(holder.startsWith(path.resolve(os.tmpdir()) + path.sep + 'bitgit-check-'));
    await fs.rm(holder, { recursive: true, force: true });
  });
  assert.equal(entry.command.length, 4000);
  assert.match(entry.command, /\[truncated\]$/);
  assert.match(entry.description, /shortened after credential redaction/);
  assert.ok(!entry.command.includes('a:b@'));
  const note = await service.dispatch({ action: 'evidence', checkpointId: saved.id, description: 'Receipt remains usable', outcome: 'untested' });
  const checkpoint = (await service.dispatch({ action: 'state' })).checkpoints[0];
  assert.equal(checkpoint.metadataError, undefined);
  assert.ok(checkpoint.evidence.some(item => item.id === note.id));
});

test('oversized serialized evidence is refused without changing the existing receipt', async t => {
  const { service, saved } = await fixture(t);
  const entry = await service.dispatch({ action: 'evidence', checkpointId: saved.id, description: 'Keep this observation', outcome: 'passed' });
  const before = await fs.readFile(service.metadataPath(saved.id));
  const evidence = Array.from({ length: 125 }, () => ({ ...entry, id: randomUUID(), output: '\u0000'.repeat(32768) }));
  await assert.rejects(service.updateMetadata(saved.id, { evidence }), /exceed 20 MiB/);
  assert.deepEqual(await fs.readFile(service.metadataPath(saved.id)), before);
  const checkpoint = (await service.dispatch({ action: 'state' })).checkpoints[0];
  assert.equal(checkpoint.metadataError, undefined);
  assert.deepEqual(checkpoint.evidence, [entry]);
});

test('a completed check reports the retained copy when its result exceeds receipt capacity', async t => {
  const { service, saved } = await fixture(t);
  const entry = await service.dispatch({ action: 'evidence', checkpointId: saved.id, description: 'Keep this observation', outcome: 'passed' });
  const evidence = Array.from({ length: 106 }, () => ({ ...entry, id: randomUUID(), output: '\u0000'.repeat(32768) }));
  await service.updateMetadata(saved.id, { evidence });
  let failure;
  await assert.rejects(service.dispatch({ action: 'runCheck', checkpointId: saved.id,
    command: 'node -e "process.stdout.write(String.fromCharCode(1).repeat(32768))"' }), error => {
    failure = error;
    return /The result could not be recorded/.test(error.message);
  });
  assert.match(failure.message, /exited with code 0/);
  const workingCopy = failure.message.split('The check copy is kept at: ')[1];
  assert.ok(workingCopy);
  t.after(async () => {
    const holder = path.dirname(workingCopy);
    assert.ok(holder.startsWith(path.resolve(os.tmpdir()) + path.sep + 'bitgit-check-'));
    await fs.rm(holder, { recursive: true, force: true });
  });
  assert.equal(await fs.readFile(path.join(workingCopy, 'app.txt'), 'utf8'), 'saved bytes\r\n');
  assert.deepEqual((await service.readMetadata(saved.id)).evidence, evidence);
  assert.equal((await service.dispatch({ action: 'state' })).checkpoints[0].metadataError, undefined);
});
