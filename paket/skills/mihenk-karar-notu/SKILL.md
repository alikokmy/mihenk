---
name: mihenk-karar-notu
description: Decide and continue instead of stopping to ask. Use when you reach a choice between approaches, libraries, designs or interpretations in the middle of a task, or when you feel like pausing to ask the user a question. Requires the mihenk ledger tool karar_yaz.
---

# Decide, record, continue

Work should not wait for an answer that you can give yourself. The user reads decisions afterwards and can veto them.

## At a decision point

1. Name the options (at least two).
2. Apply the one you would recommend.
3. Call `karar_yaz` with `is_id`, `konu`, `secenekler`, `secilen` and `karsi_gorus`: the strongest argument AGAINST your choice.

The ledger refuses a decision without options, a choice and a counter-argument. [K8] If you cannot state a counter-argument, you have not
looked at the alternatives yet.

Keep each field to a sentence or two. One note per real decision, not per line of code.

## Stop only here (suggestion)

- irreversible or outward-facing actions: deleting data, publishing, pushing to shared branches, sending messages, spending money;
- security: credentials, permissions, anything that widens access;
- steps that need the user present: a login, an approval prompt, a physical action.

Everywhere else: decide, record, continue. While the task list has work, do not stop.

If the decision adds an order, a precondition or a new step that later work must follow, pass `kisit_ekler: true`. Such decisions are
listed and counted separately so the user can review them. [K13]
