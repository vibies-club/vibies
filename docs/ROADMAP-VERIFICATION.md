# Personal Project Roadmap Verification

[Documentation home](../README.md) · [Issue #20](https://github.com/vibies-club/vibies/issues/20) ·
[Decision D-018](DECISIONS.md#d-018-add-optional-personal-project-roadmaps) ·
[Roadmap workflow](WORKFLOWS.md#13-manage-a-personal-project-roadmap)

**Status:** Implementation and proof are in progress.

This record maps the 14 acceptance criteria from issue #20 to their future
receipts. Every row is Pending until the implementation is complete and the
corresponding check has a reproducible receipt. The canonical behavior lives in
the [domain model](DOMAIN.md), [product definition](PRODUCT.md), and
[workflows](WORKFLOWS.md).

| Receipt | Acceptance criterion | Evidence | Status |
| --- | --- | --- | --- |
| P1 | An approved Member can add Milestones only to a Personal Project they own. A Roadmap is optional and does not block Publish. | Pending implementation and owner authorization proof. | Pending |
| P2 | A Personal Project accepts at most 20 Milestones. Titles are 1 to 80 plain-text characters. Blocked notes are optional and 1 to 500 plain-text characters when present. Duplicate titles are allowed. | Pending implementation and validation proof. | Pending |
| P3 | A new Milestone starts incomplete and appears at the end. An incomplete Milestone with a Blocked note is Blocked. One without a note is Incomplete. | Pending implementation and state proof. | Pending |
| P4 | One Complete checkbox completes or reopens a Milestone. Completing removes its Blocked note. Reopening makes it incomplete. | Pending implementation and state transition proof. | Pending |
| P5 | The owner edits one Milestone at a time with Save and Cancel and reorders with Move up and Move down. Completion leaves order unchanged. | Pending implementation and ordering proof. | Pending |
| P6 | The owner can delete any Milestone after confirmation that identifies it. Displayed Progress recalculates after deletion. | Pending implementation and deletion proof. | Pending |
| P7 | Progress is the completed count divided by the total count, rounded to the nearest whole percentage. A Blocked Milestone counts as incomplete. No separate Progress value is stored. | Pending implementation and calculation proof. | Pending |
| P8 | A detail page with Milestones shows the ordered Roadmap, each status and Blocked note, a progress bar, and text such as “2 of 3 complete, 67%.” It appears after shared details and before management controls. | Pending implementation and browser layout proof. | Pending |
| P9 | A Community card with Milestones shows only text such as “67% complete.” An empty Roadmap shows “No milestones yet” on its detail page with no progress bar or percentage. | Pending implementation and browser rendering proof. | Pending |
| P10 | Everyone who can view a Personal Project can view its Roadmap and Blocked notes. Only its current approved owner can change them. The Instructor can use existing Project moderation and cannot edit Milestone content. | Pending implementation and access proof. | Pending |
| P11 | Draft, Published, Archived, Connected, Disconnected, Visible, and Hidden state changes preserve the Roadmap. Project deletion deletes its Milestones. Restored availability shows the same Roadmap. | Pending implementation and lifecycle proof. | Pending |
| P12 | A stale Roadmap action does not replace a newer change. The page asks the owner to reload. | Pending implementation and concurrency proof. | Pending |
| P13 | At 20 Milestones, adding is disabled and the page explains the limit. All Roadmap controls work with a keyboard, and status is clear without color alone. | Pending implementation and accessibility proof. | Pending |
| P14 | The first version excludes dates, deadlines, assignees, notifications, milestone Comments, change history, imports, Class Project Roadmaps, and student learning Roadmaps. | Pending scope review and diff receipt. | Pending |

No row is a completion claim. The final proof will replace each Pending entry
with a receipt that names the command, observed result, and relevant code or
browser evidence.
