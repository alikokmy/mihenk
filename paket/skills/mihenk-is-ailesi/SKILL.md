---
name: mihenk-is-ailesi
description: Group dependent changes into one task family and keep measurement changes separate. Use when fixing a bug, tuning behaviour or debugging, especially when several changes depend on each other or when you are about to change a test or check.
---

# Task family

Changes that depend on each other (parts of the same root cause, pieces that need one another) are done together as ONE family and
verified together. Splitting them only produces broken intermediate states.

- Name the family and its boundary when you open the record: `aile` is the family name, `bolme_plani` says how you would split it in
  two if the result is bad. A family record without a split plan is refused. [K10]
- Independent changes are separate tasks: one record each.
- A change to the check (the test, the expected output, the measuring tool) and a change to what it checks never go into the same task.
  If you change an existing test while doing the work, the pass is marked suspicious. Change the check in its own task first. [K11]
- Do not mix a refactor with a behaviour change in the same task.
- Unrelated problems you notice go on the list as follow-ups. Do not fix them inside this task.
