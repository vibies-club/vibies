# Personal Project Roadmap Verification

[Documentation home](../README.md) · [Issue #20](https://github.com/vibies-club/vibies/issues/20) ·
[Decision D-019](DECISIONS.md#d-019-add-optional-personal-project-roadmaps) ·
[Roadmap workflow](WORKFLOWS.md#13-manage-a-personal-project-roadmap)

**Status:** Twelve criteria have automated receipts. P8 and P13 need the final
built-server browser run after their explicit layout and keyboard checks were
added.

The automated receipts use
[app-check run 34785357148](https://github.com/vibies-club/vibies/actions/runs/34785357148/job/103799723957)
at commit `a0a015b64ec31ccb465f3acd506db31cd42843ab`. It ran
`npm run test:projects`, including the database subtest `Roadmaps enforce
ownership, order, progress, visibility, limits, and stale writes`, then built
the application and ran `npm run check:access-web` against synthetic accounts
and an isolated database. The canonical behavior lives in the
[domain model](DOMAIN.md), [product definition](PRODUCT.md), and
[workflows](WORKFLOWS.md).

| Receipt | Acceptance criterion | Evidence | Status |
| --- | --- | --- | --- |
| P1 | An approved Member can add Milestones only to a Personal Project they own. A Roadmap is optional and does not block Publish. | [App check](https://github.com/vibies-club/vibies/actions/runs/34785357148/job/103799723957): `P1/P3 the owner adds one incomplete blocked milestone`; `P1/P5 publication and onboarding persist`. The database subtest denies non-owner writes. | Pass |
| P2 | A Personal Project accepts at most 20 Milestones. Titles are 1 to 80 plain-text characters. Blocked notes are optional and 1 to 500 plain-text characters when present. Duplicate titles are allowed. | [App check](https://github.com/vibies-club/vibies/actions/runs/34785357148/job/103799723957): `P2/P3 the owner can add a duplicate title`; `P2/P13 a 20-milestone roadmap disables Add`. The database subtest covers invalid lengths and the limit. | Pass |
| P3 | A new Milestone starts incomplete and appears at the end. An incomplete Milestone with a Blocked note is Blocked. One without a note is Incomplete. | [App check](https://github.com/vibies-club/vibies/actions/runs/34785357148/job/103799723957): `P1/P3 the owner adds one incomplete blocked milestone`; `P3/P10/P13 viewers see an escaped blocked note and clear Blocked status`. The database subtest checks order and both incomplete states. | Pass |
| P4 | One Complete checkbox completes or reopens a Milestone. Completing removes its Blocked note. Reopening makes it incomplete. | [App check](https://github.com/vibies-club/vibies/actions/runs/34785357148/job/103799723957): `P4/P5 Complete removes a blocked note`; `P4 clearing the Complete checkbox reopens the milestone as Incomplete`. The database subtest checks both transitions. | Pass |
| P5 | The owner edits one Milestone at a time with Save and Cancel and reorders with Move up and Move down. Completion leaves order unchanged. | [App check](https://github.com/vibies-club/vibies/actions/runs/34785357148/job/103799723957): `P5 the owner edits one milestone with its own Save action`; `P5 Move up and Move down reorder one milestone`; `P4/P5 Complete ... leaves milestone order unchanged`. The database subtest checks the same order. | Pass |
| P6 | The owner can delete any Milestone after confirmation that identifies it. Displayed Progress recalculates after deletion. | [App check](https://github.com/vibies-club/vibies/actions/runs/34785357148/job/103799723957): `P6 milestone deletion requires identifying confirmation and recalculates progress from 2 of 3 to 1 of 2`. The database subtest checks deletion and repaired positions. | Pass |
| P7 | Progress is the completed count divided by the total count, rounded to the nearest whole percentage. A Blocked Milestone counts as incomplete. No separate Progress value is stored. | [App check](https://github.com/vibies-club/vibies/actions/runs/34785357148/job/103799723957): `P7/P8/P9 detail progress rounds 2 of 3 to 67%`. The database subtest checks derived counts and confirms that no stored progress or percentage column exists. | Pass |
| P8 | A detail page with Milestones shows the ordered Roadmap, each status and Blocked note, a progress bar, and text such as “2 of 3 complete, 67%.” It appears after shared details and before management controls. | Pending: run the updated `npm run check:access-web` in app CI. Its new named check verifies the rendered progress bar and text, and verifies that Roadmap follows shared details and precedes management controls. | Pending |
| P9 | A Community card with Milestones shows only text such as “67% complete.” An empty Roadmap shows “No milestones yet” on its detail page with no progress bar or percentage. | [App check](https://github.com/vibies-club/vibies/actions/runs/34785357148/job/103799723957): `P9 an empty roadmap shows its detail message without a progress bar or percentage`; `P7/P9/P10 the Community card shows only derived percentage`. | Pass |
| P10 | Everyone who can view a Personal Project can view its Roadmap and Blocked notes. Only its current approved owner can change them. The Instructor can use existing Project moderation and cannot edit Milestone content. | [App check](https://github.com/vibies-club/vibies/actions/runs/34785357148/job/103799723957): viewer and Instructor read proof; signed-out, inactive, expired, Instructor, wrong-owner, and cross-origin write denials. The database subtest checks owner-only writes and the Community projection. | Pass |
| P11 | Draft, Published, Archived, Connected, Disconnected, Visible, and Hidden state changes preserve the Roadmap. Project deletion deletes its Milestones. Restored availability shows the same Roadmap. | [App check](https://github.com/vibies-club/vibies/actions/runs/34785357148/job/103799723957): named P11 passes for disconnected restoration, Hide and Restore, and confirmed project deletion. The database subtest checks Archived and Hidden retention and cascade deletion. | Pass |
| P12 | A stale Roadmap action does not replace a newer change. The page asks the owner to reload. | [App check](https://github.com/vibies-club/vibies/actions/runs/34785357148/job/103799723957): `P12 an exact submitted roadmap version prevents a stale add from replacing newer data and asks the owner to reload`. The database subtest checks stale results without writes. | Pass |
| P13 | At 20 Milestones, adding is disabled and the page explains the limit. All Roadmap controls work with a keyboard, and status is clear without color alone. | Pending: run the updated `npm run check:access-web` in app CI. Its new named check verifies native keyboard controls and text status, and its capacity check verifies the disabled Add control and explanation at 20 Milestones. | Pending |
| P14 | The first version excludes dates, deadlines, assignees, notifications, milestone Comments, change history, imports, Class Project Roadmaps, and student learning Roadmaps. | [PR #43 files](https://github.com/vibies-club/vibies/pull/43/files) contain Personal Project Roadmap data, UI, tests, migration, and documentation. The reviewed diff contains none of the excluded features. | Pass |
