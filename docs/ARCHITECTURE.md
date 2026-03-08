# notebooklm-capture Architecture

Chrome Extension for capturing notes from any webpage and sending them to NotebookLM.

任意のWebページからメモを取得し、NotebookLMのチャットへ送信するChrome拡張のアーキテクチャ説明です。

---

# 1. System Overview / システム概要


User
↓
Floating UI (content script)
↓
Context extractor
↓
Notebook sender
↓
NotebookLM Chat


この拡張は以下の3つの主要コンポーネントで構成されています。

1. UI Layer  
2. Context Layer  
3. Transport Layer

---

# 2. Extension Architecture / 拡張構成


Chrome Extension

manifest.json

src/

background/
service_worker.js

content/
floating_ui.js
notebook_sender.js
context_extractor.js

storage/
settings_store.js
log_store.js

ui/
options.html
options.js


---

# 3. Component Design / コンポーネント設計

## 3.1 Floating UI

責務

- メモ入力
- タグ選択
- Notebook選択
- 送信

構成


floating button
↓
expand panel
↓
textarea
↓
send button


---

## 3.2 Context Extractor

ページ情報を取得します。

取得情報


timestamp
page title
url
site hostname


Slackページの場合


workspace
channel
message link


---

## 3.3 Notebook Sender

NotebookLMチャットへメッセージを送信します。

方法


Chrome Tab Search
↓
NotebookLM Tab
↓
DOM Detection
↓
React Input Event
↓
Send


APIは使用しません。

DOM操作による送信です。

---

# 4. Message Format / メッセージフォーマット

NotebookLMへ送信する内容


[Capture]

Memo:
{user memo}

Tags:
{tags}

Source:
{page title}

URL:
{url}

Time:
{timestamp}


例


[Capture]

Memo:
Slackの議論ログ

Tags:
todo research

Source:
Slack

URL:
https://example.com

Time:
2026-03-08 12:32:11


---

# 5. Notebook Detection Strategy

NotebookLMタブ検出


chrome.tabs.query


URL


notebooklm.google.com


複数タブの場合


first active tab


または


user configured notebook


---

# 6. Storage Design

Chrome Local Storage


chrome.storage.local


保存内容


settings
notebook list
log history


---

# 7. Error Handling

想定エラー

NotebookLMタブが無い

対応


open notebook tab


DOM変更

対応


selector update


---

# 8. Security Model

この拡張は以下を行いません

- external API calls
- cloud storage
- data upload

すべて


local only


です。

---

# 9. Future Extensions

将来的に追加可能な機能

- Slack message capture
- right-click capture
- screenshot capture
- auto tagging
- AI summarization

---

# 10. Development Model

このプロジェクトは


AI assisted development


を前提としています。

Codex / ClaudeCode による並列開発

推奨スレッド


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
Log storage


---

# 11. Design Philosophy

設計思想


simple
robust
minimal dependency


NotebookLM UI変更に対しては


fix quickly


の運用方針です。
