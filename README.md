# Tracker Sync Board (VS Code Extension)

Tracker Sync Board is a standalone VS Code extension concept for two-way project tracking with visual task lanes and human/AI message exchange.

## Features

- Sidebar dashboard (Webview View)
- File-backed shared state at `.tracker/state.json`
- Task lanes: `todo`, `progress`, `done`
- Owner split: `human`, `ai`
- Milestone progress tracking for roadmap execution
- Task priority support (`P0`, `P1`, `P2`)
- Built-in message stream for Human <-> AI workflow
- Command to process unresolved human messages and post AI responses
- Command to initialize a concrete extension roadmap seed

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
- `Tracker: Initialize Extension Roadmap`

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

The repository ships with a starter tracker file at `.tracker/state.json` so you can open the UI and start immediately.

## Concrete Start

1. Press `F5` to launch Extension Development Host.
2. Open the `Tracker` activity bar icon.
3. Click `Initialize Roadmap` to seed ready-to-use tasks for building this extension.
4. Move tasks through lanes and message AI from the dashboard.
