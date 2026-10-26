# Editor and harness integrations

Status: proposed priority 8. Make the existing recovery engine convenient inside an established
editor or coding harness. The JSON CLI already supports capture, comparison, recovery and evidence;
this proposal packages and connects it rather than introducing another recovery implementation.

## I1 Packaged CLI

Provide a discoverable supported command with version and capability reporting, clear runtime
requirements, examples and stable machine-readable errors. Keep one structured response on stdout;
diagnostic output uses a separate channel and redacts credentials. Preserve existing clients until
an explicit protocol migration is adopted.

Resolve the same project identity and vault as the desktop. A caller can identify a saved project
or an absolute path; ambiguous relocated paths must not silently create unrelated history.
Return checkpoint identity, captured scope, content fingerprint, operation outcome and storage facts.
No local success implies a remote copy or a passed check.

## I2 Task boundaries

Offer Before task and After task capture commands or adapter actions. Accept a user-chosen label,
optional task/session reference and bounded description. The caller supplies those references;
BitGit does not discover them by reading private chat history or attributing filesystem edits.

A before-task action waits for an actual receipt when the selected workflow requires protection
before editing. If capture cannot produce a stable snapshot, return the failure and let the caller's
configured policy decide whether to stop or continue visibly unprotected. No adapter can claim a
successful checkpoint based on a started request or timeout.

Use request IDs and durable receipts for write retry. A lost response requires outcome lookup before
resubmitting. The same request must not create duplicate snapshots, evidence or repair operations.
Changing input under an existing request ID is a conflict. The shared
[operation contract](ARCHITECTURE.md#operation-ownership) owns these semantics.

Boundary saves do not execute checks or upload to a remote implicitly. Separate explicit actions can
request those operations with their own selected checkpoint and destination.

## I3 Open exact versions and editor actions

Provide Open checkpoint and Open recovery task navigation that selects the project, version and
task in the desktop. Use opaque project/checkpoint identifiers, not a command embedded in a URL.
Validate targets through the existing project registry; missing versions produce an actionable error.

Editor entry points can save a milestone, inspect changes and open recovery. Recovered copies use
the configured native editor command after explicit invocation. Commands and paths are passed as
validated arguments rather than interpolated shell strings. Launching an editor does not change
the original project's folder mapping or mark the copy tested.

If deep links are selected, decide how an already-running instance receives navigation. Extend the
current per-data-directory instance guard deliberately; the current second-instance exit is not a
working navigation channel. Keep isolated test profiles separate from the installed app.

## I4 Repair briefs

Generate an inspectable local brief for the user's existing coding tool. Include the selected problem,
last observed good and bad versions, comparison scope, relevant evidence, skipped/uncertain candidates,
coverage limits, current safety checkpoint and instructions for accessing a separate copy.

The brief distinguishes observations from hypotheses. Include file contents or attachments only
when selected, with redaction and size bounds. Preview before copying or exporting. Generating a
brief does not send it to another person, launch an agent, run commands, or grant write permission.

An adapter may attach the brief to an explicitly invoked local workflow, but must make that handoff
and its content clear. Keep project memory, broad Git automation and orchestration with the existing
harness rather than rebuilding them inside BitGit.

## I5 Thin adapters

Start with the smallest adapter requested by an actual user: an editor command, a harness skill,
a script wrapper, or a narrowly scoped local tool protocol. Every adapter calls the same service
and validation boundary. A permanent listener or MCP server is an optional transport choice.

Classify exposed actions by effect: read, local capture, new-folder recovery, current-file repair,
remote transfer, and command execution. Prefer a minimal surface for the first integration; remote
transfer, repair and checks require explicit calls with reviewed inputs. Do not expose arbitrary
filesystem writes or credentials through a convenience adapter.

Installing an adapter or hook is a separate user action. Document supported hosts and versions and
how to disable it. Availability of a configuration entry does not establish that a hook is installed
or has run. Test the actual chosen host when implementing its adapter.

## Acceptance criteria

- A supported invocation creates a checkpoint and the desktop shows the same identity and coverage.
- A before-task failure cannot be mistaken for protection; a successful result exists before the
  sample caller begins its edit when that boundary policy is selected.
- Simulate response loss after a save. Reconciliation returns its receipt without a duplicate write.
- Opening a checkpoint selects the correct project/version in an existing app instance.
- Errors, diagnostics and generated briefs contain no credential values or default transcript dump.
- A brief preserves uncertainty and can be used without giving BitGit an agent-runner role.
- Adapter read/capture actions cannot escalate into repair, publishing or command execution.

## Selection and open decisions

I1-I3 can ship without a plugin ecosystem. Select one real editor or harness pilot before designing
multiple transports. Decide CLI installation/discovery, version negotiation, request receipt lifetime,
deep-link registration and allowed adapter operations before each slice. Thin adapters must not
duplicate the protection policy or bypass Windows native credential storage.

## Implementation map

`git-service/src/recovery-cli.ts`, `recovery-service.ts`, `ipc-server.ts`, `recovery-types.ts`;
`src-tauri/src/main.rs`, `instance_lock.rs`, `commands.rs`; recovery workspace navigation.
