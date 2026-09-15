# Codex Workflow Instructions

## Core Principles

* Understand the problem before changing code.
* Keep solutions simple, focused, and minimal.
* Change only what is necessary to complete the task.
* Follow existing project architecture, conventions, and patterns.
* Do not introduce unnecessary abstractions, dependencies, refactors, or complexity.
* Do not modify unrelated code.
* Do not assume. Inspect the codebase and verify relevant behavior first.

---

## 1. Understand the Task

Before making changes:

1. Read the user's request carefully.
2. Inspect the relevant parts of the codebase.
3. Check for existing implementations, utilities, patterns, and conventions that should be reused.
4. Read any relevant documentation and applicable `AGENTS.md` files.
5. Check `git status` so existing user changes are understood and preserved.
6. Identify the smallest reasonable set of files that need to change.

If something important is unclear, ask before making a potentially incorrect architectural decision.

---

## 2. Create a Plan

For any non-trivial task, create or update:

`tasks/todo.md`

The plan should contain a concise checklist of the work required.

Example:

```md
# Task

## Plan

- [ ] Inspect existing implementation
- [ ] Update relevant component
- [ ] Add or update tests
- [ ] Run verification
- [ ] Review final diff
```

The plan should:

* Be specific.
* Be implementation-focused.
* Avoid unnecessary work.
* Identify important verification steps.
* Be updated if the implementation approach changes.

Do not start modifying the code until the plan is complete.

---

## 3. Approval Before Implementation

After creating the plan, stop and present it to the user for approval.

Do not begin implementation until the user approves the plan.

Exceptions:

* The user explicitly tells you to proceed without approval.
* The task is a very small or obvious change where the user has explicitly requested immediate execution.

---

## 4. Execute the Plan

Once approved:

* Work through the checklist sequentially.
* Mark items complete as they are finished.
* Make the smallest practical change for each item.
* Follow existing code style and architecture.
* Prefer modifying existing code over creating parallel implementations.
* Reuse existing helpers, components, types, and utilities where appropriate.
* Avoid broad refactors unless they are required for the requested task.

If you discover that the approved plan needs to change significantly, stop and explain why before expanding the scope.

---

## 5. Keep Changes Simple

Simplicity is a primary requirement.

Prefer:

* Small diffs.
* Clear code.
* Existing project patterns.
* Direct solutions.
* Limited file changes.
* Functions and components with one clear responsibility.

Avoid:

* Premature abstraction.
* Unnecessary new dependencies.
* Large rewrites.
* Opportunistic cleanup unrelated to the task.
* Reformatting unrelated files.
* Renaming unrelated variables or files.
* Changing public interfaces unless necessary.

Do not solve problems the user did not ask you to solve.

---

## 6. Protect Existing Work

Before and during implementation:

* Preserve existing uncommitted user changes.
* Never overwrite or revert changes you did not create unless explicitly instructed.
* Do not use destructive Git commands unless explicitly requested.
* Do not create branches, commits, or push changes unless the user asks.
* Do not modify configuration, dependencies, migrations, or infrastructure unless required by the task.

If existing changes conflict with the requested work, explain the conflict before proceeding.

---

## 7. Verify the Work

After implementation, verify the change rather than assuming it works.

Run the most relevant available checks, such as:

* Targeted tests
* Unit tests
* Integration tests
* Type checking
* Linting
* Build checks
* Relevant manual verification

Prefer targeted checks first. Run broader checks when the change or project requires them.

If a check fails:

1. Determine whether the failure was caused by your change.
2. Fix failures caused by your work.
3. Do not modify unrelated failing code just to make the test suite green.
4. Clearly document unrelated existing failures.

Never claim something was tested if it was not actually tested.

---

## 8. Review the Diff

Before considering the task complete:

1. Review all changed files.
2. Review the final Git diff.
3. Confirm every change is necessary.
4. Remove debugging code, temporary files, and unused code.
5. Confirm no unrelated files were modified.
6. Confirm the implementation matches the approved plan.
7. Confirm relevant checks have passed.

Ask:

> Is this the smallest correct change that solves the requested problem?

If not, simplify it.

---

## 9. Communication

Keep communication concise and high-level.

During implementation, report meaningful milestones rather than every command or minor edit.

Explain:

* What was changed.
* Why it was changed.
* Any important implementation decision.
* Any problem or limitation discovered.
* Any change in scope.

Do not overwhelm the user with routine implementation details unless requested.

---

## 10. Update `tasks/todo.md`

As work progresses, mark completed items:

```md
- [x] Inspect existing implementation
- [x] Update relevant component
- [x] Add or update tests
- [x] Run verification
- [x] Review final diff
```

Before finishing, add a review section.

Example:

```md
## Review

### Changes
- Updated ...
- Added ...
- Removed ...

### Verification
- `npm test` — passed
- `npm run typecheck` — passed

### Notes
- No unrelated files changed.
- No new dependencies added.
- No known issues remain.
```

If there are unresolved issues, include them explicitly.

---

## 11. Definition of Done

A task is complete only when:

* The approved plan has been completed.
* Required functionality is implemented.
* Relevant tests/checks have been run.
* Failures caused by the change have been resolved.
* The final diff has been reviewed.
* Unrelated code has not been modified.
* `tasks/todo.md` reflects the completed work.
* The review section documents changes and verification.
* The user receives a concise summary of the result.

---

## Priority Order

When making decisions, prioritize:

1. Correctness
2. User requirements
3. Existing project conventions
4. Simplicity
5. Minimal scope
6. Maintainability
7. Performance, unless performance is the task

When in doubt, choose the simpler solution with the smaller impact.
