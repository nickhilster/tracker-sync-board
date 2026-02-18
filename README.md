# Tracker Sync Board (VS Code Extension)

Tracker Sync Board is a standalone VS Code extension concept for two-way project tracking with visual task lanes and human/AI message exchange.

## Features

- Sidebar dashboard (Webview View)
- File-backed shared state at `.tracker/state.json`
- Task lanes: `todo`, `progress`, `done`
- Owner split: `human`, `ai`
- Built-in message stream for Human <-> AI workflow
- Command to process unresolved human messages and post AI responses

## Quick Start

```powershell
npm install
npm run compile
```

Press `F5` in VS Code to open an Extension Development Host and use the **Tracker** activity bar icon.

## Commands

- `Tracker: Open State File`
- `Tracker: Process Human Messages`
- `Tracker: Refresh Dashboard`

## Data Model

State lives in `.tracker/state.json` in the active workspace.

```json
{
  "revision": 1,
  "updatedAt": "2026-02-18T18:00:00Z",
  "tasks": [],
  "messages": []
}
```
