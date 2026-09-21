// Disposable repositories, bare remotes and an isolated Git environment for git-reliability tests.
// Nothing here touches the user's Git configuration, real remotes or real projects.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const INHERITED_GIT_VARIABLES = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_PREFIX', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL', 'GIT_EDITOR', 'GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_ASKPASS', 'SSH_ASKPASS',
];

// Synthetic credential shaped like a GitHub token; matches the shared policy pattern, grants nothing.
export const FAKE_TOKEN = `ghp_${'Ab1Cd2Ef3G'.repeat(4)}`;

export function createSandbox() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'bitgit-git-reliability-')));
  const home = join(root, 'home');
  mkdirSync(home);
  const globalConfig = join(root, 'gitconfig');
  writeFileSync(globalConfig, [
    '[user]', '\tname = Fixture User', '\temail = fixture@example.invalid',
    '[init]', '\tdefaultBranch = trunk',
    '[core]', '\tautocrlf = false',
    '[commit]', '\tgpgsign = false',
    '[protocol "file"]', '\tallow = always', '',
  ].join('\n'));
  for (const name of INHERITED_GIT_VARIABLES) delete process.env[name];
  Object.assign(process.env, {
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    GIT_TERMINAL_PROMPT: '0',
  });

  let counter = 0;
  return {
    root,
    dir: (name) => join(root, `${String(counter++).padStart(3, '0')}-${name}`),
    dispose: () => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
  };
}

export function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).replace(/\r?\n$/, '');
}

export function gitResult(cwd, args, input) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8', input });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

export function write(cwd, relativePath, content) {
  const full = join(cwd, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

export function commitAll(cwd, message) {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

export function head(cwd) {
  return git(cwd, 'rev-parse', 'HEAD');
}

export function indexBytes(cwd) {
  return git(cwd, 'ls-files', '--stage', '-z');
}

export function remoteHeads(remote) {
  return git(remote, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads');
}

export function newBareRemote(sandbox, name = 'remote') {
  const remote = sandbox.dir(`${name}.git`);
  git(sandbox.root, 'init', '-q', '--bare', '-b', 'trunk', remote);
  return remote;
}

export function cloneRemote(sandbox, remote, name = 'clone') {
  const work = sandbox.dir(name);
  git(sandbox.root, 'clone', '-q', remote, work);
  return work;
}

// A bare remote plus a clone whose first commit is pushed with upstream tracking (default branch: trunk).
export function seedProject(sandbox, name = 'project') {
  const remote = newBareRemote(sandbox, name);
  const work = cloneRemote(sandbox, remote, `${name}-work`);
  write(work, 'README.md', '# fixture\n');
  commitAll(work, 'initial');
  git(work, 'push', '-q', '-u', 'origin', 'trunk');
  return { remote, work };
}

// Another machine's clone of the same remote.
export function otherMachine(sandbox, remote) {
  return cloneRemote(sandbox, remote, 'other');
}

// Creates `count` commits in one process, changing bulk.txt each time; the first also adds `firstFiles`.
export function fastImportCommits(cwd, branch, count, firstFiles = {}) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const message = `bulk ${i}`;
    parts.push(`commit refs/heads/${branch}\ncommitter Fixture User <fixture@example.invalid> ${1700000000 + i} +0000\ndata ${Buffer.byteLength(message)}\n${message}\n`);
    if (i === 0) parts.push(`from refs/heads/${branch}^0\n`);
    const files = { ...(i === 0 ? firstFiles : {}), 'bulk.txt': `${i}\n` };
    for (const [name, content] of Object.entries(files)) {
      parts.push(`M 100644 inline ${name}\ndata ${Buffer.byteLength(content)}\n${content}\n`);
    }
    parts.push('\n');
  }
  const run = gitResult(cwd, ['fast-import', '--quiet'], parts.join(''));
  if (run.status !== 0) throw new Error(`fast-import failed: ${run.stderr}`);
  git(cwd, 'reset', '-q', '--hard');
}
