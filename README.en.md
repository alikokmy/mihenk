# mihenk

**Write down your idea, let an AI turn it into software, and let mihenk check that the work was really done.**
(Turkish: [README.md](README.md).)

mihenk is a window that gets an AI coding tool on your computer (for example Claude Code) to do the work. You describe what you
want in your own words. mihenk splits it into small jobs, hands them to the AI one by one, and confirms each job with its own check.
A job is not done just because the AI says so.

You don't need to know how to code, use the command line or get admin rights. Windows only for now.

## Getting started

### 1. Get an AI tool (once)

mihenk does not do the work itself; it has an AI coding tool installed on your computer do it. The most tested one is
**Claude Code**:

- Install: [Claude Code setup page](https://code.claude.com/docs/en/setup). Paste the one-line command from the Windows section into
  PowerShell; no admin rights needed.
- After installing, type `claude` once and sign in with your Anthropic account. Claude Code needs a paid subscription or an API account.

Other options: [OpenCode](https://opencode.ai) (can also run with a free model on your own computer), Codex CLI, Kilo Code CLI. How
much each tool has been tested is in "Details" below.

### 2. Download mihenk

**[Download mihenk (Windows, zip)](https://github.com/alikokmy/mihenk/releases/latest/download/mihenk-windows.zip)**

Everything it needs is inside; nothing else to install.

1. Right-click the downloaded zip and choose **Extract All**.
2. Put the extracted folder somewhere permanent, for example **Documents**, and don't move it afterwards.

### 3. Open it

1. Double-click **`Mihenk-Ac.cmd`** in the folder. A black window opens, then the mihenk page appears in your browser.
2. Because it came from the internet, Windows may show a security warning. Press **Run**; if there is no such button, press **More
   info**, then **Run anyway**.
3. The window starts in Turkish. To switch: **Ayarlar** (Settings) tab, **Dil** (Language), choose `en`.
4. Open a **New project** or choose the folder you want to work on. mihenk asks before installing itself into that folder.
5. To open it easily next time, press **Put a shortcut on the desktop** on the page.

### 4. Write your idea

1. On the **Job list** tab, type what you want into **Describe your idea**. Example: "I want a simple app to store and search my recipes."
2. Press **Split into jobs**. The AI splits the idea into small jobs. Read them; delete what you don't want, fix what is wrong.
3. Press **Start the list**. The jobs run one by one, and the page shows each job's state: waiting, running, done, failed.
4. A job counts as **done** only when mihenk's check passes. If the AI tries to make its own check easier, the job is marked
   **suspicious**.

You can leave a long list running overnight; "keep the computer awake while the list runs" in **Settings** stops the computer from
sleeping.

When you close the browser tab, mihenk closes by itself within a few minutes; if a list is running, it waits for it to finish.

### Common questions

- **Something went wrong.** The **Health** section on the **Project** tab says OK or PROBLEM on each line and what to do. If it says no AI tool
  was found, go back to step 1.
- **I want to undo a change the AI made.** **Ledger** tab, **Undo its changes** next to that job. It shows what will happen first.
- **How much did I spend, which tool is better?** The **Recommendation and cost** tab.
- **I want to report a bug.** **Project** tab, **Create a problem report**. It makes one file with personal paths and keys removed; attach it
  to a [new GitHub issue](https://github.com/alikokmy/mihenk/issues).
- **I want to remove mihenk.** From a project: **Remove** on the **Project** tab; the project returns to how it was before mihenk. From
  the computer: delete the folder you downloaded.
- **No internet / I want to use my own model.** See "Offline use with a local model" below.

---

## Details (for the curious and for developers)

What follows is technical; you don't need it to use mihenk.

mihenk is a thin layer that AI coding agents connect to. It records every job before work starts, checks the evidence itself, runs
a job list without you watching, and measures which agent to give which kind of job. The name: *mihenk taşı* is the touchstone used
to test gold. The project tests two things: whether the work is actually correct, and how good each agent is at each kind of job
(correctness, time, cost).

**Status: version 0.7.** History and open items are in [docs/IS_PLANI.md](docs/IS_PLANI.md) and [docs/SONUCLAR.md](docs/SONUCLAR.md)
(Turkish).

Messages are in Turkish by default. From the command line: `mihenk ayar dil en` (or `sistem` to follow the computer's language).
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
