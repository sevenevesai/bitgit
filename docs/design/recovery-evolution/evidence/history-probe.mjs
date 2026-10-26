import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { RecoveryService } from '../../../../git-service/dist/recovery-service.js';

// Reproduce only in a newly owned fixture. Retain all bytes for later inspection.
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bitgit-review-probe-'));
const source = path.join(root, 'source');
await fs.mkdir(source);
await fs.writeFile(path.join(source, 'app.js'), 'export const works = true;\n');
const service = new RecoveryService(source, { vaultRoot: path.join(root, 'vaults') });
const first = await service.dispatch({ action: 'create', label: 'Working version' });
const { manifest } = await service.readManifest(first.commitOid);
const measures = [];

async function measureState(count) {
  const start = performance.now();
  const state = await service.dispatch({ action: 'state' });
  return { count, milliseconds: Math.round(performance.now() - start), returned: state.checkpoints.length };
}

for (let count = 1; count <= 100; count++) {
  if (count > 1) {
    const id = randomUUID();
    const copy = { ...manifest, id, label: `Milestone ${count}`, createdAt: new Date(Date.now() + count).toISOString() };
    const oid = (await service.git(['commit-tree', first.treeOid], JSON.stringify(copy))).toString('utf8').trim();
    await service.git(['update-ref', `refs/checkpoints/${id}`, oid]);
  }
  if ([1, 25, 100].includes(count)) {
    const measurement = await measureState(count);
    measures.push(measurement);
    console.log(JSON.stringify(measurement));
  }
}

const brokenId = randomUUID();
const brokenRef = `refs/checkpoints/${brokenId}`;
const brokenOid = (await service.git(['commit-tree', first.treeOid],
  'intentionally invalid manifest in a disposable review fixture')).toString('utf8').trim();
await service.git(['update-ref', brokenRef, brokenOid]);
let corruptState;
try {
  const state = await service.dispatch({ action: 'state' });
  corruptState = { returned: state.checkpoints.length };
} catch (error) {
  corruptState = { error: error.message };
}
const recovery = await service.dispatch({ action: 'recover', checkpointId: first.id,
  destination: path.join(root, 'recovered-good') });
// Delete only the ref just created here, and only if it still names our synthetic object.
await service.git(['update-ref', '-d', brokenRef, brokenOid]);
const repeat = await measureState(100);
const result = { root, measures, corruptState, validCheckpointStillRecoverable: recovery.fileCount === 1, repeat };
await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
