---
name: mihenk-kanit-ve-hukum
description: Close a task with a server-run verification instead of a claim. Use whenever you are about to say a task is done, fixed, passing or complete, or when a verification failed and you must decide what to do next. Requires the mihenk ledger tools (hukum_ver, kanit_ekle).
---

# Evidence, then verdict

Evidence is the output of a command, not a sentence. You do not declare evidence: the server produces it. [K4]

## Closing a task

Call `hukum_ver` with the task's `is_id`. The server runs the recorded verification command and writes the exit code, duration and an
output summary into the ledger itself.

- Exit code 0: the task closes as `gecti`. Only now may you report it as done.
- Anything else, including a timeout: the task stays OPEN. Fix the work and call `hukum_ver` again. [K5]

Never write "done", "fixed" or "tests pass" in your report unless `hukum_ver` returned `durum: "gecti"` for that task. Notes added with
`kanit_ekle` are your own claims: useful context, never a verdict.

## When it will not pass

- You gave up: `hukum_ver` with `hukum: "kaldi"` and a `gerekce` saying why. The server still runs the verification.
- The command passes but does not really measure the task: `hukum: "belirsiz"` with a `gerekce`.

Both need a reason. [K7] A failed task that is recorded honestly is a good result; a failed task reported as done is the worst one.

A closed task never changes. New work on the same topic is a new record. [K6]

## Long output

Tool results are bounded. When output is cut, the result gives a file path with the full text: read only the part you need. [K9]
