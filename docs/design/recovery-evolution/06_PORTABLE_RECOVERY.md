# Portable recovery context

Status: proposed priority 6. Users should be able to move selected saved code and the evidence used
to recognise it to another machine. Existing remote backup transfers source snapshots; later notes,
command results and screenshots stay local. That supported path remains compatible.

## B1 Selected recovery package

Offer an explicit export of chosen checkpoints plus selected annotations, evidence, screenshots and
recovery requirements. Present a contents and exclusion preview, total size, destination and any
sensitive material warnings. Exporting the vault wholesale is not the default.

The package has a versioned manifest, immutable checkpoint identities, item types, declared sizes,
content digests and relationships. Include a digest of each annotation/evidence revision so later
metadata can be distinguished from the version previously copied. Preserve original names and
timestamps separately from local display names and import time.

Exclude credentials, native authentication settings, unrelated project history, raw environment
variables and transcripts. A screenshot can contain sensitive visible text that code-secret screening
does not detect; show attachments for intentional selection and do not imply screening proves them
safe. Recipe commands and outputs receive existing redaction plus export review.

Choose a bounded package/container format before implementation. Per-snapshot limits still apply;
also define package-wide count, decompressed-size, nesting and attachment limits. A local file export
is the first transport. An optional remote transport must not upload other reachable history or
silently turn a code backup into an evidence upload.

## B2 Metadata backup revisions

Keep the existing snapshot backup receipt and an evidence-package receipt separate. A source snapshot
may be confirmed remotely while newer notes have never been copied. Show exactly which metadata
revision and attachments were last transferred and verified.

Metadata export does not amend immutable checkpoint commits. Publish packages or metadata revisions
under separate immutable identities with selected-object reachability. A failed upload leaves the
previous verified receipt and the new unconfirmed state visible. Existing backups without evidence
remain importable and clearly identify their coverage.

Remote destinations are chosen and reviewed explicitly. Do not assume a filesystem destination is
on another disk or that a network URL guarantees continued availability. Encryption at rest for
portable evidence is an open transport requirement; select and document key recovery before claiming
an encrypted-backup feature. Never place authentication tokens in a package or its filenames.

## B3 Verified import

Treat all package bytes, paths and metadata as untrusted. Validate the container and manifest bounds,
safe paths, object types, content digests and cross-references before exposing imported contents.
Reject traversal, links, unsafe Git metadata paths and unsupported required versions. Preserve a
failed package for inspection without publishing partially validated history.

Use staging and atomic publication. Explicitly distinguish importing history from recovering source
files: neither should overwrite the current project. Source checkpoints are revalidated through
the existing recovery policy; evidence files keep their format and size checks.

Deduplicate exact identities and digests. Conflicting content under the same claimed identity must
be refused or preserved as a conflict, never silently replace trusted local evidence. Bind imported
history to the chosen local project identity through a reviewed mapping. A missing original source
path does not prevent import or new-folder recovery.

Imported check recipes, executable-looking text and suggested setup steps are inert until explicitly
reviewed and invoked. Unknown optional metadata can be preserved with a warning if the format permits
it; an unsupported mandatory field must not be silently dropped.

## B4 Recovery rehearsal

Provide a guided rehearsal from a chosen backup into a fresh local identity and destination. Verify
the selected source bytes and evidence digests independently of the original vault. Record source
package, snapshot ID, destination, time, result and uncovered setup requirements.

The result distinguishes Files matched, Context imported, Setup incomplete and Selected checks run.
Successful byte verification does not assert that the application or deployed service works.
Testing setup or commands remains an explicit [recipe run](05_GUIDED_RECOVERY.md#g5-reusable-check-recipes).

Offer a later rehearsal reminder or a batch verification action only as selected functionality.
A reminder does not execute commands, download arbitrary packages, or certify a remote copy.

## B5 External requirements

Let a project record a declarative recovery guide: runtime versions, lockfile locations, required
environment variable names, external service names, database backup locations and manual setup
instructions. State which entries are user supplied and when they were last reviewed.

Store references and instructions rather than live secrets or database content. Distinguish Captured
source, Recorded requirement and Uncovered external state. Optional future provider adapters require
their own explicit scope and credentials; this spec does not add database or deployment restoration.

## Acceptance criteria

- Export selected checkpoints and evidence, remove access to the original vault, then import and
  recover on an isolated profile. Verify source and attachment hashes and preserve original IDs.
- Add a note after backup. The UI reports that newer context is not included in the prior receipt.
- Old source-only remote backups continue to import with accurate missing-evidence information.
- Truncated packages, excessive decompression, traversal, links, tampered digests, duplicate IDs and
  conflicting evidence are rejected without replacing existing history or executing content.
- A failed remote transfer or metadata publication cannot advance the confirmed receipt.
- Review package contents to prove unrelated checkpoints, credentials and native settings are absent.
- A rehearsal clearly separates verified files from unperformed setup and untested external services.

## Selection and open decisions

B1 and local B3 can ship before remote metadata transport B2. B4 composes import and guided recovery;
B5 is useful as local documentation independently. Choose package format, global bounds, digest and
identity rules, conflict handling, transport and any encryption/key lifecycle before each slice.

## Implementation map

`git-service/src/recovery-remote.ts`, `recovery-metadata.ts`, `recovery-evidence.ts`,
`recovery-types.ts`; `src/components/recovery/BackupPanel.tsx`, `RemoteRestore.tsx`,
`EvidencePanel.tsx`; new package validation belongs at the service boundary.
