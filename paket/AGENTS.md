## mihenk: working method

This project uses the mihenk ledger (MCP server `mihenk`). The ledger enforces the rules below; they are not optional.

- **Before any task:** call `is_ac` (question, expectation, what you would see if wrong, ONE verification command).
- **To finish:** call `hukum_ver`. The server runs the verification itself. Report a task as done only if it returned `durum: "gecti"`.
- **Verification failed:** the task stays open. Fix it and call `hukum_ver` again, or close it honestly as `kaldi` with a reason.
- **Decision needed:** apply the option you recommend and record it with `karar_yaz` (options, chosen, strongest counter-argument).
  Stop only for irreversible or outward-facing actions, security, or steps that need the user present.
- **Session start:** call `rapor` with `durum: "acik"` and continue open tasks first.
- **Long output:** tool results are bounded; the full text is in the file path the tool returns.

Skills with the details: `mihenk-is-kaydi`, `mihenk-kanit-ve-hukum`, `mihenk-karar-notu`, `mihenk-ucuz-denetim`,
`mihenk-is-ailesi`, `mihenk-bagimsiz-dogrulama`, `mihenk-kok-neden`.
