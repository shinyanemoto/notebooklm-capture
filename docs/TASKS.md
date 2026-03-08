# notebooklm-capture Development Tasks

This document defines the implementation tasks for the notebooklm-capture project.

このファイルは notebooklm-capture の実装タスクを定義します。

The goal is to allow AI agents (Codex / ClaudeCode) to implement the extension step by step.

AIエージェントが段階的に開発できるようにタスクを分割しています。

---

# Development Strategy / 開発方針

Implementation order

```
1. Extension Skeleton
2. Floating Memo UI
3. NotebookLM Sender
4. Context Extractor
5. Settings Storage
6. Log System
```

Each task should be implemented independently when possible.

---

# TASK 1 — Extension Skeleton

Goal

Create the basic Chrome extension structure.

Files

```
manifest.json
src/background/service_worker.js
src/content/floating_ui.js
src/content/notebook_sender.js
src/content/context_extractor.js
src/storage/settings_store.js
src/storage/log_store.js
src/ui/options.html
src/ui/options.js
```

Requirements

- Manifest V3
- background service worker
- content scripts support
- extension loads without errors

---

# TASK 2 — Floating Memo UI

Goal

Create a floating memo button on all pages.

Features

```
small floating button
expandable memo input
textarea input
send button
tag buttons
```

Behavior

```
click button → open memo panel
click send → trigger capture
```

File

```
src/content/floating_ui.js
```

---

# TASK 3 — NotebookLM Sender

Goal

Send memo text to a NotebookLM chat.

Steps

```
find NotebookLM tab
if not found → open tab
detect chat input element
insert memo text
trigger send
```

File

```
src/content/notebook_sender.js
```

Important

NotebookLM uses React.

The implementation must trigger a proper input event.

---

# TASK 4 — Context Extractor

Goal

Collect page metadata.

Extract

```
timestamp
page title
URL
hostname
```

Slack special case

```
workspace
channel
message permalink
```

File

```
src/content/context_extractor.js
```

---

# TASK 5 — Settings Storage

Goal

Store user configuration.

Storage

```
chrome.storage.local
```

Data

```
notebook list
UI preferences
tag presets
```

Files

```
src/storage/settings_store.js
src/ui/options.html
src/ui/options.js
```

---

# TASK 6 — Log System

Goal

Store capture history locally.

Stored data

```
memo
tags
timestamp
source page
```

File

```
src/storage/log_store.js
```

---

# TASK 7 — Message Builder

Goal

Build message text sent to NotebookLM.

Format

```
[Capture]

Memo:
{memo}

Tags:
{tags}

Source:
{page title}

URL:
{url}

Time:
{timestamp}
```

---

# TASK 8 — Error Handling

Handle errors for

```
NotebookLM tab missing
DOM selector changed
send failure
```

Fallback behavior

```
open notebook tab
retry send
log error
```

---

# TASK 9 — Basic Testing

Test scenarios

```
memo capture
context extraction
notebook sending
settings storage
log storage
```

---

# Future Tasks

Planned features

```
right-click capture
Slack message capture
screenshot capture
auto tagging
AI summarization
batch export
```

---

# AI Development Notes

This project is designed for AI-assisted development.

AI agents should:

```
follow architecture.md
implement one task per thread
avoid modifying unrelated files
```

---

# Recommended Thread Assignment

```
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
```
