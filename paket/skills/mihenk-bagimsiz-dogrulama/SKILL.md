---
name: mihenk-bagimsiz-dogrulama
description: Have work checked by someone who did not write it. Use for results that matter (a fix going to users, a measured claim, a design decision, a "this is impossible" conclusion) and whenever you can start a subagent, a second session or a different model to review.
---

# The author does not verify (suggestion)

Whoever wrote the work is the worst placed to find its mistakes: they check what they meant, not what they did.

When the result matters, give it to an independent checker (a subagent, a fresh session, another model) in two roles:

- **Verifier:** receives the task record and the diff, NOT your conclusion. Re-runs the verification and checks that the command really
  measures what the record asks.
- **Refuter:** tries to break it. Looks for an input, a case or a reading under which the result is wrong.

Rules for the handoff:

- Hand over the material, not your opinion of it. A checker told "this works, please confirm" will confirm.
- Read their findings as findings, not as attacks: fix, or record why not with `karar_yaz`.
- If the checker shows the verification command is too weak, close the task as `belirsiz` and open a new record with a better command.

A verification command that can never fail proves nothing. Ask: "what would this print if my work were wrong?"
