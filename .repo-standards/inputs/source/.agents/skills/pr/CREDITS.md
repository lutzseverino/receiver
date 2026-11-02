# Credits

This skill is Repo Canon's own, taken from the `pr` skill in [Matt Pocock's skills](https://github.com/mattpocock/skills). Its upstream base is tag `v1.3.1`, commit `24fe0ef7737efae15c87225755e9f6f5965e4888`, at [`skills/engineering/pr`](https://github.com/mattpocock/skills/tree/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/pr). That material is used under its MIT License, whose notice adoption installs beside the skills as `.agents/skills/LICENSE.mattpocock-skills`.

The skill differs from its upstream base as follows. `SKILL.md` states that a prompt or brief naming the skill is its invocation. Evidence requires screenshots on an orphan `pr-assets/<topic>` branch, image links by full commit SHA, and permanent retention of asset branches during cleanup. Its template ends with a Related issue section after Merge Danger, holding a closing or partial-work reference or a Direct change reason, and keeps the four sections in order with any other material in a subsection of the section it belongs to. Evidence lists every check run on the final commit with its outcome and explains any required check not run, and Merge Danger names the change's relevant limits and a breaking change's impact and migration. This file keeps upstream's credits below unchanged. The `show-me` material those credits name is covered by HumanLayer's MIT License, whose notice adoption installs beside the skills as `.agents/skills/LICENSE.humanlayer-skills`.

## Upstream credits

The upstream skill's own `CREDITS.md` follows unchanged; "this repo" there is the upstream repository.

The **Summary** section's menu of visuals (pseudocode, call trees, component trees, file trees, Mermaid, diffs) and its placement guidance come from [Dex Horthy](https://github.com/dexhorthy)'s [`show-me`](https://github.com/humanlayer/humanlayer) skill, reproduced almost word for word and aimed at a diff instead of a live conversation. `pr` does not depend on `show-me` as a skill (it isn't part of this repo, and a hard dependency would break standalone installs), so the content is copied in rather than pointed at; this file is the attribution a dependency would otherwise have carried.
