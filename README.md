# Project Builder

> **Drag. Drop. Done.**
> A desktop app that auto-detects your frontend project, initializes Git, installs dependencies, and runs the build — all in one click.

---

## What it does

Drop any extracted frontend project folder onto the window (or paste the path), and Project Builder:

1. **Detects** the framework (Vite, Next.js, Angular, Nuxt, SvelteKit) and package manager (npm, yarn, pnpm, bun)
2. **Initializes Git** — `git init`, stages all files, makes the initial commit, renames branch to `main`
3. **Sets the remote** — wires up your GitHub repo URL so you can push when ready
4. **Installs dependencies** — runs the correct install command for your package manager
5. **Builds the project** — streams live output to a terminal panel inside the app
6. **Outputs to your chosen folder** — default is `dist/` inside the project, or pick any destination

All steps run sequentially with live streaming output so you can watch exactly what's happening.

---

## Features

- **Drag-and-drop or path input** — works both ways
- **Auto-detection** — framework, package manager, git status, build scripts
- **One-level deep search** — drop an outer/wrapper folder and it finds the real project root automatically
- **Custom output folder** — native folder picker, or type the path manually
- **Live terminal log** — colored stdout/stderr streamed in real time
- **GitHub remote wiring** — enter `username/repo` and it sets the remote for you
- **Cross-framework** — Vite, Next.js, Angular, Nuxt, SvelteKit, plain Node.js

---

## Getting started

### Run in development
```bash
npm install
npm run dev
```

### Build for production
```bash
npm run build
```

### Package as Windows installer (.exe)
```bash
npm run package
# Output → release/
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 31 |
| UI framework | React 18 + TypeScript |
| Bundler | Vite 5 via electron-vite |
| Styling | Tailwind CSS 3 |
| IPC | Electron contextBridge |
| Build runner | Node.js `child_process.spawn` |
| Packaging | electron-builder |

---

## Project structure

```
project-builder/
├── electron/
│   ├── main.ts        # Main process — IPC handlers, child_process runner, shell
│   └── preload.ts     # contextBridge — exposes API to renderer safely
├── src/
│   ├── assets/
│   │   └── logo.svg   # Project Builder logo
│   ├── App.tsx        # Main UI — drop zone, config panel, output terminal
│   ├── main.tsx       # Renderer entry point
│   └── index.css      # Tailwind base styles
├── electron.vite.config.ts
├── package.json
└── README.md
```

---

## Author

**Donald M. Valdez**

| | |
|---|---|
| 🌐 Website | [donaldvaldez.com](https://donaldvaldez.com) |
| 🐙 GitHub | [@DonaldValdez](https://github.com/DonaldValdez) |
| 💼 LinkedIn | [linkedin.com/in/donaldvaldez](https://linkedin.com/in/donaldvaldez) |
| 𝕏 Twitter/X | [@donaldmvaldez](https://x.com/donaldmvaldez) |
| ✉️ Email | [donaldmvaldez@gmail.com](mailto:donaldmvaldez@gmail.com) |

---

## License

MIT © 2025 Donald M. Valdez
