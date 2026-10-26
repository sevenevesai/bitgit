# Onboarding and first recovery

Status: proposed priority 2. A new user should protect a local project and retrieve a saved copy
before needing GitHub knowledge. The [review](ANALYSIS.md#first-use-without-github-credentials)
reproduced an error at the optional GitHub step with no stored credentials.

## Current behaviour

Add Project asks for a name, offers GitHub, then asks for the local folder. GitHub absence can
produce a null dereference. A local project's prominent action creates a GitHub repository. Local
checkpoints already work without GitHub and without a source Git repository. Node and Git are
runtime prerequisites; the packaged app launches Node from PATH.

## O1 Choose a local project first

The primary entry is Protect a project. Choose an existing local folder using the native picker;
derive an editable project name from its final component. Show detected Git context as information,
not a prerequisite to understanding the save flow. Reuse an already linked project when its identity
is established; let users review ambiguous duplicates or relocation rather than merging them silently.

Provide separate secondary entries for cloning a GitHub repository and importing a recovery package.
Remote-only setup remains useful, but must not interrupt a local-only journey. Preserve scanning
and selecting existing folders; selecting a parent directory must not protect every child implicitly.

Folder validation explains unavailable, unreadable, unsupported-link, or unsuitable locations before
creating misleading protection status. A Git read must not initialize the source repository. A
project entry may be retained when a save fails, with Never saved and a retry action.

## O2 First save and recovery rehearsal

1. Inspect coverage. Show intended source, exclusions, limits and the local storage location in
   readable groups. A default selection must be visible and editable.
2. Name the first milestone. Offer a neutral editable suggestion such as Before my next changes;
   do not claim the app works based on a successful capture.
3. Save through the existing verified checkpoint operation. A changed preview requires a refreshed
   review; a failed or incomplete capture does not advance the protected state.
4. Show the exact saved version and offer Recover a test copy. Choose a new destination outside the
   source and vault, then verify bytes using the ordinary recovery path.
5. Offer the [recovery handoff](05_GUIDED_RECOVERY.md#g3-recovery-handoff) and optional next steps:
   automatic local saves and a remote backup destination. These are explicit opt-ins.

The rehearsal can be skipped and resumed later. Completing setup means an actual checkpoint was
saved; completing the rehearsal means the recovered files matched it. Neither means the application
ran successfully. Normal setup and recovery do not install project dependencies or execute scripts.

## O3 GitHub connection

Treat no credentials as a normal unconnected state. Fix the optional native result type and its UI
handling; display Connect GitHub when the user chooses a GitHub operation. Cancellation, offline
status, rejected credentials and restricted repository access have separate messages and retry paths.
Do not show No repositories found when the request never successfully listed repositories.

Retain secure token setup until a GitHub OAuth application is registered, as previously directed.
Browser sign-in is a separately selectable slice after registration and platform review. Its design
must define cancellation, expiry, token refresh/revocation where supported, and native credential
storage; no client identity or secret is invented as part of this spec.

Before creating or linking a remote, show account, owner, repository visibility and destination.
Choosing a backup destination does not commit or publish the working tree. Existing remote URLs
must not be rewritten merely because a project label or account setting changes.

## O4 Prerequisites and runtime packaging

Detect whether the required Git and Node runtimes are available and compatible. Explain which
action is unavailable and provide a concrete setup or retry route; an empty project screen is not
evidence that the service started successfully. Retain accessible local history where its required
runtime is available instead of blocking unrelated UI on GitHub setup.

Evaluate bundling the Node runtime with the service to remove PATH dependence. Compare installer
size, update ownership, supported operating systems, runtime patching and diagnostics before selecting
it. Git bundling versus clear prerequisite setup is a separate decision. Do not replace the storage
engine solely to remove installation friction.

An adopted runtime bundle must be covered by clean-machine install, upgrade, updater, offline-start,
and missing-runtime tests. Existing user runtimes and Git configuration must not be modified as a
side effect of saving a project. Preserve native credentials through an upgrade.

## O5 Product descriptions and accessibility

Align the website, installer, empty state and introductory documentation with supported save,
compare and recovery behaviour. Describe code recovery and external-state limits accurately; remove
claims that conflict with reviewed whole-file publishing or retained source branches.

Use one terminology set: Save version, Back up version, Recover copy, and Git details. Offer concise
explanations at the decision point and expandable technical detail. Existing users retain direct
access to Git operations. Provide keyboard navigation, focus containment and restoration, labelled
controls, validation text, readable contrast and consistent light/dark rendering in the setup flow.

## Acceptance criteria

- On a fresh isolated profile with no credentials, select a plain folder, save eligible source,
  recover a verified copy, and reach the editor handoff without a GitHub request or credential error.
- Skip and later resume the rehearsal. No false completed marker or duplicate project is created.
- Try a moved folder, duplicate path, missing folder, nested repository and source changing during
  preview. The result is explicit and does not initialize or overwrite source Git state.
- Disconnect the network during optional GitHub setup. Local save and history remain usable.
- Verify empty-account results, failed authorization and cancelled connection are distinguishable.
- If O4 is selected, verify the actual installer on a clean Windows account without Node on PATH.
- Complete setup with the keyboard and both themes; errors remain associated with their controls.

## Selection and open decisions

Ship O1 and the null-credential fix independently of OAuth or runtime bundling. O2 composes existing
save/recover actions; detailed handoff behaviour is owned by G3. Choose prerequisite packaging,
first-run copy wording, and whether to retain an incomplete project entry before the relevant slice.

## Implementation map

UI: `src/components/AddProjectModal.tsx`, `SettingsModal.tsx`, `ProjectCard.tsx`, and recovery panels.
Native: `src-tauri/src/commands.rs`, `git_service.rs`, `credentials.rs`, `tauri.conf.json`.
Distribution: `website/index.html`, root README and installer/build documentation.
