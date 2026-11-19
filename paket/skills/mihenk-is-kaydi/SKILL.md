---
name: mihenk-is-kaydi
description: Open a ledger record before starting any coding task (bug fix, feature, refactor, test, config change, research). Use at the very start of work, before editing files or running commands, whenever the mihenk ledger tools (is_ac, hukum_ver, rapor) are available.
---

# Record before work

A task that is not in the ledger does not exist: the ledger refuses notes, decisions and verdicts for a task it does not know. [K1]

## At session start

Call `rapor` with `durum: "acik"`. Continue open tasks before opening new ones.

## Before the first edit

Call `is_ac` once per task:

- `tur`: short task type label: `hata_duzeltme`, `ozellik`, `yeniden_duzenleme`, `test`, `belge`, `arastirma`, `yapilandirma`.
- `soru`: what is being done or asked, in one or two sentences.
- `beklenti`: what you will observe if the work is right.
- `yanlissa`: what you will observe if your approach is wrong. If you cannot name it, you do not yet know what you are testing.
- `dogrulama_komutu`: ONE command that shows the task is done, such as `npm test` or `pytest -q tests/test_x.py`.
- `ajan`, `model`: the tool and the model you are.

The verification command runs on the server, from the project root, without a shell: `&&`, pipes, redirects and programs outside the
allow list are refused. Put compound steps into a script or an npm script and call that. [K2]

Every field is required and short (1000 characters at most). The record cannot be edited after it is opened, so write it carefully. [K3]

One task, one record. If a task will not fit in one session, split it and open a record per piece.

## Two gears (suggestion)

Exploring can be light: a quick look, a smoke run, no ceremony. Anything you will report as a result goes through a record and a verdict.
