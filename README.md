# notebooklm-capture

Chrome extension for quickly capturing notes from any webpage and sending them to a selected NotebookLM chat.

任意のWebページから素早くメモを取り、指定したNotebookLMのチャットに送信できるChrome拡張です。

---

# Overview / 概要

NotebookLMはナレッジ整理に非常に強力ですが、  
ブラウジング中のアイデアを素早くNotebookLMに送る手段はあまりありません。

この拡張は **NotebookLMの入力デバイスのように使うツール**です。

NotebookLM is powerful for organizing knowledge, but capturing ideas into it quickly from arbitrary webpages is difficult.

This extension acts as an **input device for NotebookLM**.

---

# Concept / コンセプト


Web page
↓
Quick memo
↓
NotebookLM Chat


ブラウジング中に思いついたことを即座にNotebookLMへ送ります。

Use cases:

- research notes
- quick idea capture
- Slack conversation notes
- TODO logging
- collecting AI conversation results

---

# Features / 主な機能

## Floating Memo UI

すべてのページに小さなメモボタンを表示します。

クリックするとメモ入力UIが開きます。

Features:

- memo textarea
- tag buttons
- send button
- notebook selector

---

## Send to NotebookLM Chat

メモをNotebookLMのチャットへ直接送信します。

The extension interacts with NotebookLM through the browser DOM.

特徴:

- API不要
- React UI対応
- 自動入力イベント発火

---

## Context Capture

メモ送信時にコンテキストを付与します。

追加される情報:

- timestamp
- page title
- URL
- site name

Slackページの場合:

- workspace
- channel
- message link

---

## Notebook Selection

送信先NotebookLMを選択できます。

Example configuration:


Idea
https://notebooklm.google.com/notebook/xxxxx

Research
https://notebooklm.google.com/notebook/yyyyy


NotebookLMトップページのDOM解析を避けるため  
手動登録方式を採用しています。

---

## Local Log

送信したメモをローカル保存します。

保存先:


chrome.storage.local


用途:

- 振り返り
- デバッグ
- 履歴確認

---

# Non Goals / やらないこと

このプロジェクトでは以下は対象外です。

- NotebookLM API利用
- 自動Notebook検索
- クラウド同期
- 重いUIフレームワーク

設計思想は **シンプルで壊れにくいこと**です。

---

# Technology / 技術

Chrome Extension


Manifest V3


主な技術:

- content scripts
- background service worker
- MutationObserver
- DOM interaction
- chrome.storage

---

# Project Structure


notebooklm-capture/

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

docs/
ARCHITECTURE.md


---

# Development Strategy

このプロジェクトは  
**AIエージェント (Codex) による並列開発**を前提としています。

Recommended development threads:


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

# Architecture

アーキテクチャの詳細は以下を参照してください。


docs/ARCHITECTURE.md


---

# Status

Early prototype stage.

現在は以下を重点開発しています。

- extension architecture
- reliable NotebookLM sending
- minimal UX

---

# License

MIT
