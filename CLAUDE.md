# Claude Project Instructions

## Core Rules

* Understand the problem before changing code.
* Inspect the relevant implementation before proposing a solution.
* Follow existing architecture, conventions, naming, and patterns.
* Make the smallest correct change that solves the requested problem.
* Reuse existing code before introducing new abstractions.
* Do not modify unrelated code.
* Do not introduce dependencies, refactors, or architectural changes unless necessary.
* Verify assumptions against the actual codebase.
* Never claim something works unless it has been verified.

---

## 1. Inspect Before Changing

Before modifying code:

1. Read the user's request carefully.
2. Inspect the relevant files and surrounding implementation.
3. Search for related components, utilities, types, services, tests, and existing patterns.
4. Read relevant project documentation.
5. Check `git status` and preserve existing user changes.
6. Determine the smallest reasonable scope for the task.

Do not start coding based only on the prompt.

If an important requirement cannot be determined from the request or codebase, identify the ambiguity before making a significant architectural assumption.

---

## 2. Plan Non-Trivial Work

For non-trivial tasks, create or update:

`tasks/todo.md`

The plan should contain a concise implementation checklist.

Example:

```md
## Plan

- [ ] Inspect current implementation
- [ ] Identify root cause or required change
- [ ] Implement smallest solution
- [ ] Add or update tests
- [ ] Run verification
- [ ] Review final diff
```

The plan must:

* Reflect the actual codebase.
* Be implementation-focused.
* Include verification.
* Avoid speculative work.
* Keep scope as small as possible.

Do not create an elaborate plan for a trivial change.

---

## 3. Approval Before Implementation

After preparing the plan:

1. Present the approach to the user.
2. Stop.
3. Wait for approval before implementing.

Do not begin implementation until the user approves the plan.

Exceptions:

* The user explicitly says to proceed without approval.
* The user explicitly requests immediate implementation.
* The task is trivial and planning would provide no meaningful value.

If implementation later requires a significant departure from the approved plan, explain why before expanding scope.

---

## 4. Implementation Rules

Once approved:

* Work through the plan sequentially.
* Mark completed items in `tasks/todo.md`.
* Follow existing project patterns.
* Prefer modifying existing implementations over creating parallel ones.
* Reuse existing helpers, components, services, types, and utilities.
* Keep public API changes to a minimum.
* Keep files and responsibilities focused.

Prefer:

* Small diffs
* Direct solutions
* Existing abstractions
* Existing dependencies
* Clear control flow
* Easy-to-review code

Avoid:

* Premature abstraction
* Unnecessary helper layers
* Large rewrites
* Opportunistic cleanup
* Unrelated formatting
* New dependencies for small functionality
* Solving hypothetical future requirements

Do not solve problems the user did not ask you to solve.

---

## 5. Bug Fixing

When fixing a bug, do not immediately patch the visible symptom.

### Confirm the Problem

Before changing code:

* Identify expected behavior.
* Identify actual behavior.
* Trace the relevant execution path.
* Reproduce or confirm the issue when possible.
* Inspect relevant state, data flow, logs, errors, and tests.

Do not assume the first suspicious code is the cause.

### Identify the Root Cause

Before implementing the fix, determine:

* Where the incorrect behavior originates.
* Why the current implementation behaves incorrectly.
* Whether the problem comes from code, data, state, configuration, timing, integration behavior, or environment.

For non-trivial bugs, briefly record the root cause in `tasks/todo.md`.

Example:

```md
## Root Cause

The component stores the initial API value in local state but never
updates that state when the active record changes.
```

Do not implement a fix until there is reasonable evidence supporting the root cause.

### Fix the Cause

Prefer correcting the underlying problem.

Avoid symptom-level fixes such as:

* Arbitrary conditionals
* Silent error swallowing
* Unexplained retries
* Artificial delays
* Hardcoded values
* Duplicate state used as a workaround
* Disabling validation or tests
* Special cases masking broken logic

Workarounds are acceptable when the underlying cause cannot reasonably be fixed within the task or is controlled by an external system. Clearly document them as workarounds.

### Regression Protection

When practical, add or update a test that:

1. Demonstrates the broken behavior.
2. Passes after the fix.
3. Protects against the regression returning.

Prefer testing observable behavior rather than implementation details.

---

## 6. Protect Existing Work

Assume existing uncommitted changes belong to the user.

* Check `git status`.
* Preserve changes you did not create.
* Do not overwrite or revert unrelated work.
* Do not modify unrelated files to simplify your implementation.

Never use destructive Git commands unless explicitly requested.

Do not automatically:

* Commit
* Push
* Force-push
* Change branches
* Rewrite history
* Reset working files

If existing work conflicts with the requested task, explain the conflict.

---

## 7. Dependencies and Configuration

Do not add a dependency if the task can reasonably be solved using:

* Existing project dependencies
* Platform APIs
* Existing utilities
* A small local implementation

Do not modify package versions, lockfiles, build configuration, environment configuration, database migrations, CI configuration, or infrastructure unless required by the task.

If a new dependency or configuration change is necessary, explain why.

---

## 8. Verification

After implementation, run the most relevant available checks.

Depending on the project:

* Targeted tests
* Unit tests
* Integration tests
* Type checking
* Linting
* Build
* Relevant manual verification

Prefer targeted verification first.

Run broader checks when the scope of the change warrants them.

Never claim a command or test passed unless it was actually run.

If verification fails:

1. Determine whether the failure was introduced by the current change.
2. Fix failures caused by the implementation.
3. Re-run relevant verification.
4. Do not modify unrelated failing code merely to make the suite green.

Clearly distinguish:

* Failures caused by this task
* Pre-existing failures
* Environment/tooling limitations

For bug fixes, verify the original reported behavior directly whenever possible.

---

## 9. Final Review

Before declaring the task complete:

1. Review all modified files.
2. Review the final Git diff.
3. Confirm every change is necessary.
4. Remove temporary/debugging code.
5. Remove unused code introduced during implementation.
6. Confirm unrelated files were not modified.
7. Confirm the implementation matches the approved scope.
8. Confirm relevant verification was performed.

Ask:

> Is this the smallest correct implementation?

If not, simplify it.

---

## 10. Communication

Keep progress updates concise and high-level.

Communicate:

* What area is being changed
* Why the change is necessary
* Important implementation decisions
* Problems discovered
* Material changes to the approved plan
* Verification results

Do not narrate routine commands or every small edit.

Surface important discoveries early if they materially change the task.

---

## 11. Complete the Task Record

Before finishing, update `tasks/todo.md`.

It should contain:

* Completed checklist
* Root cause, when applicable
* Summary of changes
* Verification performed
* Known limitations or unresolved issues

Do not mark something complete until it is actually complete.

---

## Decision Priority

When choosing between approaches, prioritize:

1. Correctness
2. User requirements
3. Existing behavior
4. Existing project conventions
5. Simplicity
6. Minimal scope
7. Maintainability
8. Performance, unless performance is specifically part of the task

When two approaches are equally correct, prefer the one that changes less code and introduces fewer concepts.
