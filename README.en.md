# mihenk

A thin layer that AI coding agents connect to. It records every job before work starts, checks the evidence itself, runs a job
list without you watching, and measures which agent to give which kind of job. (Turkish: [README.md](README.md).)

The name: *mihenk taşı* is the touchstone used to test gold. The project tests two things: whether the work is actually correct,
and how good each agent is at each kind of job (correctness, time, cost).

**Status: version 0.5** (the recommendation accounts for difficulty, quota share on subscriptions and exploration; 0.4: offline package and OpenCode with a local model). Double-click `mihenk-pencere.cmd` to manage everything from one window in your browser (project, job list, ledger, settings with notes, recommendation and cost); it only listens on 127.0.0.1 and is protected by a key that changes every time. Work plan (Turkish): [docs/IS_PLANI.md](docs/IS_PLANI.md).

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

## Offline use with a local model (OpenCode)

For a machine with no internet, a self-hosted model (Qwen, DeepSeek...) behind an OpenAI-compatible API, and OpenCode.

**Build the package.** On a machine with internet, run `npm run paketle`. It produces `cikti/mihenk-<version>-win32-x64.zip`
(about 100 MB). The zip contains Node.js, mihenk and all its dependencies.

**Install on the offline machine.** No internet, `npm install`, Node.js install or admin rights are needed.

1. Unzip the package to a permanent folder.
2. Double-click `Mihenk-Ac.cmd`. The mihenk window opens in your browser; choose your project there (folder picker or pasted path) or open a new project for your idea. Every setting is in the window; no command line or file editing is needed.

The settings that mihenk writes call the bundled `node.exe` by its full path, so do not move the folder after you install.

**OpenCode settings.** mihenk adds only its own entry to `opencode.json`. It does not touch your provider, model or other MCP
entries. The entry depends on the OpenCode version found on the machine:

- **OpenCode 2.x:** `mcp.servers.mihenk` with `codemode: false`. OpenCode 2.x exposes MCP tools through "Code Mode" by default. With
  `codemode: false`, the five mihenk tools reach the model as direct tools, which is more reliable for small local models.
- **OpenCode 1.x:** `mcp.mihenk` (not tested on 1.x).

**Turn off OpenCode's internet calls.** Set `OPENCODE_DISABLE_MODELS_FETCH=1` and `OPENCODE_DISABLE_AUTOUPDATE=1` (`setx` needs no
admin rights). The Turkish README has a sample provider configuration.

**Tested with OpenCode 2.3.2,** with the internet cut and a fake local model server. Requests went only to the local server, and the
model's `mihenk_is_ac` call opened a ledger record. It was not tested against a real Qwen or DeepSeek server.

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
