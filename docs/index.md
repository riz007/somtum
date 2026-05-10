---
layout: home

hero:
  name: "Somtum"
  text: "Local-first memory for Claude Code"
  tagline: Automatically captures decisions, bug fixes, and learnings from every session — and injects them back on the next one.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: How It Works
      link: /guide/how-it-works
    - theme: alt
      text: GitHub
      link: https://github.com/riz007/somtum

features:
  - icon: 🥣
    title: Automatic Capture
    details: At session end, Claude Haiku extracts durable observations from the transcript — decisions, bug fixes, learnings, commands — and stores them in a local SQLite database.
  - icon: ⚡
    title: Auto-Inject on Every Prompt
    details: The UserPromptSubmit hook retrieves the most relevant memories via BM25 and injects them before every message. No manual recall step needed.
  - icon: 🌶️
    title: Prompt Cache
    details: Exact and fuzzy-matched prompts skip the model entirely. The embedding cache saves API credits and keeps sessions fast.
  - icon: 🥕
    title: Local-Only Storage
    details: All data lives in a local SQLite WAL database at ~/.somtum/. No cloud accounts, no telemetry, no data leaves your machine except to the Anthropic API.
  - icon: 📊
    title: Visual Dashboard
    details: Run `somtum serve` to open a browser dashboard — searchable memory browser, knowledge graph, analytics, and a forget button.
  - icon: 🔄
    title: Multi-Device Sync
    details: Synchronize memories across machines with SSH. Hostname-aware merging ensures no data loss across sessions from different machines.
---
