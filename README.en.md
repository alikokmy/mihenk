# mihenk

A thin layer that AI coding agents connect to. It records every job before work starts, checks the evidence itself, runs a job
list without you watching, and measures which agent to give which kind of job. (Turkish: [README.md](README.md).)

The name: *mihenk taşı* is the touchstone used to test gold. The project tests two things: whether the work is actually correct,
and how good each agent is at each kind of job (correctness, time, cost).

**Status: version 0.1, version 0.2 in progress.** Work plan (Turkish): [docs/IS_PLANI.md](docs/IS_PLANI.md).

Messages are in Turkish by default. To switch to English: `mihenk ayar dil en` (or `sistem` to follow the computer's language).
Texts sent to the agent (skills, ledger and gate messages) are in English or Turkish regardless of this setting.

## Install into a project

```
node <mihenk folder>/dist/src/cli.js kur --hedef <project folder>
```

No admin rights are needed. This writes the ledger connection for the supported tools (Claude Code, Codex CLI, OpenCode, Kilo
Code; Gemini CLI, Antigravity, Cline and Qwen Code untested or partly tested) and adds double-click files to the project:

| File | What it does |
|---|---|
| `mihenk-baslat.cmd` | runs the job list (`mihenk-isler.json`) |
| `mihenk-ayarlar.cmd` | numbered menu to turn every feature on or off, with a note under each setting |
| `mihenk-rapor.cmd` | opens a one-page plain-language report of what was done |
| `mihenk-kaldir.cmd` | removes everything mihenk added; your files return byte for byte to how they were |

## How it keeps the work honest

- An agent opens a record before working and closes it with `hukum_ver`; **mihenk runs the check command itself**. "Done" from the
  agent does not count.
- In Claude Code and Codex sessions you open yourself, a hook refuses "done" and `git commit` without evidence.
- Optional guards: tests changed or skipped during a job, a check that already passed before the work, flaky tests, regressions in
  the full suite, destructive commands (`rm -rf` outside the project, `git reset --hard`, `git push --force`).

## Job list (driver)

Copy `mihenk-isler.ornek.json` to `mihenk-isler.json`, describe each job (what to do, what success looks like, what failure looks
like, one check command) and double-click `mihenk-baslat.cmd`. The driver gives each job to an agent, retries, hands over to a
fresh session when the context grows, saves each passed job as a local commit, and never pushes unless you ask. You can set
dollar and time caps per job and per list; it waits and retries when the AI service hits a usage limit.

## Undo and report

- `mihenk geri-al <job>` undoes one job's file changes without git; files changed later by another job or by you are left alone.
- `mihenk rapor --ac` opens the report; the driver refreshes it and shows a Windows notification when a list ends.
- `mihenk oneri` recommends an agent per job type from measured results, or says "not enough data".

## Remove

Double-click `mihenk-kaldir.cmd`. Your job history is moved out of the project (to `%LOCALAPPDATA%\mihenk\kaldirilan\`), not deleted.
