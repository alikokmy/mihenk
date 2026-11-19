---
name: mihenk-kok-neden
description: Find the root cause from logs before changing code. Use when something fails unexpectedly, a test is flaky, a fix did not work, or you are about to try a second guess at the same bug. Also use when writing code that will need debugging later.
---

# Root cause from the log (suggestion)

A fix without a known cause is a guess. A second guess on top of a failed one is noise.

## When something fails

1. Read the actual error and the log BEFORE editing. The full output of a ledger verification is in the file path the tool returned.
2. State the cause in one sentence, with the line of evidence that shows it. No evidence: you have a hypothesis, not a cause.
3. If the log cannot tell you, the first change is to add logging, not to change behaviour.
4. Fix the cause, not the symptom. Do not weaken or delete the check that caught it.

## When writing code

Log each operation with its name and its inputs, with a start line and an end line. Then the next failure explains itself.

The ledger does this for its own operations in `.mihenk/log.jsonl`: every call has a `basla` and a `bitti` line with inputs and outcome.

Record what you found with `kanit_ekle`: the cause, and the evidence line.
