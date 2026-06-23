import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { existsSync, readFileSync, readdirSync, cpSync } from 'fs'

const isMac = process.platform === 'darwin'

function buildMenu(win: BrowserWindow): void {
  const menu = Menu.buildFromTemplate([
    // macOS: first menu item is always the app name menu
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          async click() {
            const result = await dialog.showOpenDialog(win, {
              properties: ['openDirectory'],
              title: 'Select a project folder'
            })
            if (!result.canceled && result.filePaths[0]) {
              win.webContents.send('menu-open-project', result.filePaths[0])
            }
          }
        },
        { type: 'separator' },
        // Quit lives in the App menu on macOS; keep it in File on Windows/Linux
        ...(!isMac ? [{
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click() { app.quit() }
        }] : [])
      ]
    },
    {
      label: 'Build',
      submenu: [
        {
          label: 'Run Setup + Build',
          accelerator: 'CmdOrCtrl+B',
          click() { win.webContents.send('menu-run-build') }
        },
        {
          label: 'Start Over',
          accelerator: 'CmdOrCtrl+R',
          click() { win.webContents.send('menu-reset') }
        },
        { type: 'separator' },
        {
          label: isMac ? 'Show Output in Finder' : 'Open Output in Explorer',
          click() { win.webContents.send('menu-open-output') }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Project Builder',
          click() {
            dialog.showMessageBox(win, {
              type: 'info',
              icon: join(__dirname, '../../src/assets/icon.png'),
              title: 'About Project Builder',
              message: 'Project Builder v1.0.0',
              detail: [
                'Drag-and-drop desktop app that auto-detects your frontend project,',
                'initializes Git, installs dependencies, and runs the build — in one click.',
                '',
                'Built by Donald M. Valdez',
                'donaldvaldez.com'
              ].join('\n')
            })
          }
        },
        { type: 'separator' },
        {
          label: 'GitHub Repository',
          click() { shell.openExternal('https://github.com/DonaldValdez') }
        },
        {
          label: 'Website',
          click() { shell.openExternal('https://donaldvaldez.com') }
        },
        { type: 'separator' },
        {
          label: 'Report an Issue',
          click() { shell.openExternal('https://github.com/DonaldValdez/project-builder/issues') }
        }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)
}

function createWindow(): void {
  const iconPath = join(__dirname, '../../src/assets/icon.png')
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 520,
    backgroundColor: '#0f172a',
    title: 'Project Builder — by Donald M. Valdez',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  buildMenu(win)

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)

// On macOS: don't quit when all windows close — keep the app in the dock
app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

// On macOS: re-create the window when the dock icon is clicked and no windows are open
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ── Detection helpers ──────────────────────────────────────────────────────

function detectPackageManager(dir: string): string {
  if (existsSync(join(dir, 'bun.lockb'))) return 'bun'
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

function detectFramework(dir: string): string {
  if (existsSync(join(dir, 'next.config.js')) || existsSync(join(dir, 'next.config.ts'))) return 'Next.js'
  if (existsSync(join(dir, 'vite.config.ts')) || existsSync(join(dir, 'vite.config.js'))) return 'Vite'
  if (existsSync(join(dir, 'angular.json'))) return 'Angular'
  if (existsSync(join(dir, 'nuxt.config.ts')) || existsSync(join(dir, 'nuxt.config.js'))) return 'Nuxt'
  if (existsSync(join(dir, 'svelte.config.js'))) return 'SvelteKit'
  if (existsSync(join(dir, 'package.json'))) return 'Node.js'
  return 'Unknown'
}

function getPackageScripts(dir: string): string[] {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
    return Object.keys(pkg.scripts ?? {})
  } catch {
    return []
  }
}

// ── IPC: open external URL ────────────────────────────────────────────────

ipcMain.handle('open-external', (_e, url: string) => shell.openExternal(url))

// ── IPC: folder picker ────────────────────────────────────────────────────

ipcMain.handle('pick-folder', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select output folder'
  })
  return result.canceled ? null : result.filePaths[0]
})

// ── IPC: detect project ────────────────────────────────────────────────────

function findProjectRoot(dir: string): string | null {
  // Direct hit
  if (existsSync(join(dir, 'package.json'))) return dir
  // Search one level deep (handles zipped exports with a wrapper folder)
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const sub = join(dir, entry.name)
      if (existsSync(join(sub, 'package.json'))) return sub
    }
  } catch { /* unreadable dir */ }
  return null
}

ipcMain.handle('detect-project', (_e, dir: string) => {
  const root = findProjectRoot(dir)
  if (!root) return { error: 'No package.json found in this folder or its subfolders.' }
  return {
    root,
    framework: detectFramework(root),
    packageManager: detectPackageManager(root),
    scripts: getPackageScripts(root),
    hasGit: existsSync(join(root, '.git'))
  }
})

// ── IPC: run pipeline ──────────────────────────────────────────────────────

ipcMain.on('run-pipeline', (event, { dir, pm, framework, hasGit, repoUrl, outputDir }: {
  dir: string
  pm: string
  framework: string
  hasGit: boolean
  repoUrl: string
  outputDir: string
}) => {
  const send = (text: string, type: 'cmd' | 'out' | 'err' | 'done' | 'fail') =>
    event.sender.send('pipeline-output', { text, type })

  const runCmd = (cmd: string, args: string[], cwd: string): Promise<void> =>
    new Promise((resolve, reject) => {
      send(`> ${cmd} ${args.join(' ')}`, 'cmd')
      const child = spawn(cmd, args, { cwd, shell: true })
      child.stdout.on('data', (d) => send(d.toString(), 'out'))
      child.stderr.on('data', (d) => send(d.toString(), 'err'))
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))))
    })

  // Resolve where the framework puts its output by default
  const defaultOutDir = framework === 'Next.js' ? join(dir, '.next')
    : framework === 'Angular' ? join(dir, 'dist')
    : join(dir, 'dist')

  ;(async () => {
    try {
      if (!hasGit) {
        await runCmd('git', ['init'], dir)
        await runCmd('git', ['add', '.'], dir)
        await runCmd('git', ['commit', '-m', '"chore: initial commit"'], dir)
        await runCmd('git', ['branch', '-M', 'main'], dir)
      }
      if (repoUrl) {
        await runCmd('git', ['remote', 'add', 'origin', repoUrl], dir).catch(() =>
          runCmd('git', ['remote', 'set-url', 'origin', repoUrl], dir)
        )
      }
      await runCmd(pm, ['install'], dir)

      // For Vite, pass --outDir directly; for others build normally then copy
      if (outputDir && framework === 'Vite') {
        await runCmd(pm, ['run', 'build', '--', '--outDir', outputDir], dir)
      } else {
        await runCmd(pm, ['run', 'build'], dir)
        if (outputDir && outputDir !== defaultOutDir) {
          send(`> Copying output to ${outputDir}`, 'cmd')
          cpSync(defaultOutDir, outputDir, { recursive: true })
        }
      }

      const outLabel = outputDir || defaultOutDir
      send(`✓ Done! Output → ${outLabel}`, 'done')
      if (repoUrl) send('  To push: git push -u origin main', 'done')
    } catch (err: unknown) {
      send(`✗ ${err instanceof Error ? err.message : String(err)}`, 'fail')
    }
  })()
})
