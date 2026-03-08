# AGENTS.md

AI development rules for the notebooklm-capture project.

This document defines how AI agents (Codex, Claude Code, or other coding agents) should work in this repository.

このファイルは AI エージェントが notebooklm-capture を安全に開発するためのルールを定義します。

---

# 1. Project Overview

Project


notebooklm-capture


Type


Chrome Extension (Manifest V3)


Purpose

Capture notes from any webpage and send them to a NotebookLM chat.

任意のWebページからメモを取得し NotebookLM のチャットに送信する Chrome 拡張。

---

# 2. Documents AI Must Read

Before implementing anything, agents MUST read:


README.md
docs/ARCHITECTURE.md
docs/TASKS.md


The architecture must be followed exactly.

---

# 3. Development Principles

Agents must follow these principles.


simple
robust
minimal dependency


Avoid:


large frameworks
external APIs
cloud services


The extension must remain lightweight.

---

# 4. Architecture Rules

The architecture is defined in:


docs/ARCHITECTURE.md


Agents must not change architecture without explicit instruction.

Layers


UI Layer
Context Layer
Transport Layer


Responsibilities must remain separated.

---

# 5. File Responsibilities


floating_ui.js
UI interaction

context_extractor.js
page metadata extraction

notebook_sender.js
NotebookLM communication

settings_store.js
user settings

log_store.js
capture history


Do not mix responsibilities.

---

# 6. Development Workflow

Agents should follow this process.


read architecture
select task
implement minimal version
test logic
commit changes


Do not implement multiple tasks in one step.

---

# 7. Task Execution

Tasks are defined in


docs/TASKS.md


Agents should implement tasks in order.

Preferred parallelization:


Thread 1
Extension skeleton

Thread 2
Floating UI

Thread 3
Notebook sender

Thread 4
Context extractor

Thread 5
Settings system

Thread 6
Log system


Each thread should modify only relevant files.

---

# 8. Coding Style

Prefer


plain JavaScript
modular files
small functions


Avoid


global variables
complex abstractions
large dependencies


---

# 9. Chrome Extension Constraints

Manifest version


Manifest V3


Use


content scripts
background service worker
chrome.storage
chrome.tabs


Do not use unsupported APIs.

---

# 10. NotebookLM Interaction

NotebookLM does not provide a public API.

Interaction must be done through:


DOM detection
input event simulation
React-compatible events


Agents should implement robust selectors.

---

# 11. Error Handling

Agents must handle:


NotebookLM tab missing
DOM structure changes
send failures


Fallback behavior:


open notebook tab
retry send
log error


---

# 12. Commit Guidelines

Commits must be small and focused.

Good example:


add floating UI skeleton
implement context extractor
add notebook sender logic


Avoid large commits.

---

# 13. Safety Rules

Agents must never:


upload data externally
store user data remotely
collect sensitive information


All processing must remain local.

---

# 14. Future Extensions

Possible future features:


right-click capture
Slack message capture
screenshot capture
auto tagging
AI summarization


These features must not break the core architecture.

---

# 15. Goal for AI Agents

The goal is to gradually build a reliable Chrome extension through small tasks.

Agents should prefer:


incremental progress
simple implementations
clear commits


The system should remain easy to maintain and repair when NotebookLM UI changes.
