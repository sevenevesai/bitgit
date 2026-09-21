# Recovery orchestration record

The user invoked `/orchestrate` for the full roadmap. All implementation workers and independent
reviews are integrated. The completion status is in [the plan](RECOVERY_PLAN.md), and test/native
evidence is in [verification](RECOVERY_VERIFICATION.md). No GitHub publication was performed.
Local main merge: `adb23c2`. All 15 sessions listed below were confirmed closed after their reports
and documentation were integrated. Parent smoke processes were stopped; test fixtures were retained.

## Available cost estimates

Recorded child-session estimates total **$87.03 USD**, computed before rounding the rows below.
These are per-session usage/recap observations, including follow-up turns, without a second sum
of an aggregate. The full task cost is unavailable: Lloom reports `usageAvailable: false` for
parent Codex session `aad26266-17c8-4043-a9eb-8fb1b6c45240`. Closed-session live lookups may no longer
resolve; these estimates were captured during orchestration and are not a billing statement.

| Work | Lloom session | Estimated USD |
|---|---|---:|
| Git implementation | 7f798e4c-8449-4586-a090-82292648ebc7 | 8.9079 |
| Native implementation | 3ab76b41-0479-41a4-80b8-62eaae33cb11 | 7.3140 |
| Recovery extensions | 4ed8d08a-669e-4f8d-92ca-753caac9275f | 3.5625 |
| Recovery UI | 432d6bb9-795d-4462-a711-f33dce18fa92 | 4.7739 |
| Visual Git UI | a2f8d279-c2d0-4c4b-a068-e487642314ce | 7.7475 |
| Extensions UI | 31849348-eba3-439f-85ba-422228cab47d | 9.9264 |
| Foundation review | f7fb2b05-09a9-4c3b-8350-af6119ab4bcd | 9.2037 |
| Complete review | 4b0bc720-221a-45db-bf2b-d4f0cb01ffc6 | 9.2279 |
| Final release review and follow-ups | faaa1aeb-5a1d-42b2-a3e7-ed86119db1ca | 24.9797 |
| Map | 887b8629-ec4a-4155-ac71-852b9d87e3d2 | 0.2087 |
| Map | 07a972ca-9e56-4eca-818c-df6bdc8a5dad | 0.1554 |
| Map/follow-up | b76d2452-2e94-483f-9726-7677a459f424 | 0.2963 |
| Map | c3334315-4f20-4ae4-94fc-6158293d3e24 | 0.2515 |
| Map | 0591d74c-5ecb-490d-af81-2f17e9397201 | 0.2809 |
| Final map | 21d6595f-16ac-41cf-b3e4-e60ae67f7354 | 0.1987 |

## Scope decisions

The release uses the existing secure token setup. Browser sign-in follows GitHub OAuth app
registration, as the user directed. Feature-aware AI repair and participant recruitment remain
research hypotheses; selective repair restores explicitly chosen whole files with safety saves.
Installer signing, live GitHub transport and POSIX behavior were not part of the observed gates.
