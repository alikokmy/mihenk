---
name: mihenk-tek-degisiklik
description: Change one thing per run. Use when fixing a bug, tuning behaviour, debugging a failing test or comparing approaches, and especially when you are tempted to apply several fixes at once before checking.
---

# One change per run (suggestion)

If you change three things and the result moves, you do not know which one moved it. If it does not move, you do not know whether two of
them cancelled out.

- Make ONE change, run the check, read the result. Then the next change.
- Keep a change that helped; revert one that did not before trying the next.
- Do not mix a refactor with a behaviour change in the same step.
- Unrelated problems you notice go on the list as follow-ups. Do not fix them inside this task.

Several small verified steps finish sooner than one large step that has to be untangled.
