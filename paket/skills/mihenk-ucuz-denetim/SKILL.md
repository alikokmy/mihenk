---
name: mihenk-ucuz-denetim
description: Run the cheapest check first. Use before launching anything slow or expensive (a full test suite, a long build, a training run, a migration, a batch job), and right after writing new code, before building more on top of it.
---

# Cheap check first (suggestion)

Most mistakes show up in the first seconds. Find them there, not at the end of a ten-minute run.

1. **Smoke run:** does it start at all? Import the module, run one function, run a single test.
2. **Short real try:** run it on a small piece of REAL data or the real code path, not on a toy that cannot fail.
3. **Then the full check:** the suite, the build, the long run.

If the cheap check fails, stop and fix: do not start the expensive one "to see what happens".

Write what the cheap check showed with `kanit_ekle` when it changes your plan. A negative result is a result: record it too.

This does not replace the verdict. The task still closes only through `hukum_ver`.
