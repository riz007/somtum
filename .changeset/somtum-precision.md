---
'somtum': patch
---

Inject fewer, better memories, and extract fewer, better ones. Tested on a real session with a real model.

- **Recall precision.** For prompts of three or more content words, a memory must share at least two of them to be injected (`injection.min_matched_terms`, default 2). One shared word, like the project's main noun, is no longer enough. When nothing qualifies, nothing is injected rather than the weakest match.
- **Word forms match.** Search and the injection check strip common endings and allow prefix matches on longer words, so "installed" finds "install" and "tailwind" finds "tailwindcss".
- **Extraction keeps what the code can't say.** The extractor no longer records descriptions of how code is structured (the agent can read the code). It now keeps decisions, constraints from outside the code, user preferences, root causes and commands, merges duplicates, and returns fewer observations rather than padding. On the same real session: 10 memories with about half narrating code, became 8 that were all rules or decisions, including two it had previously missed.
- `somtum stats` says "1 call" instead of "1 calls".
