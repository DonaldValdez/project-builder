import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { existsSync, readFileSync, writeFileSync, readdirSync, cpSync } from 'fs'

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

function isNitroProject(dir: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    return '@tanstack/react-start' in deps || '@lovable.dev/vite-tanstack-config' in deps
  } catch {
    return false
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

// ── HTML post-processing ───────────────────────────────────────────────────

function walkHtml(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkHtml(full, acc)
    else if (entry.isFile() && entry.name.endsWith('.html')) acc.push(full)
  }
  return acc
}

// For Nitro/SSR builds that produce no index.html, generate a minimal CSR shell
// so the output can be opened in a browser. TanStack Router mounts client-side
// into #root and falls back to CSR when no server-rendered HTML is present.
function generateFallbackIndexHtml(outDir: string): boolean {
  const assetsDir = join(outDir, 'assets')
  if (!existsSync(assetsDir)) return false

  const assets = readdirSync(assetsDir)
  const cssFiles = assets.filter(f => f.endsWith('.css'))
  const mainJs = assets.find(f => f.startsWith('index-') && f.endsWith('.js'))
  if (!mainJs) return false

  const hasFavicon = existsSync(join(outDir, 'favicon.ico')) || existsSync(join(outDir, 'favicon'))
  const faviconTag = hasFavicon ? '\n    <link rel="icon" href="./favicon.ico" type="image/x-icon" />' : ''
  const linkTags = cssFiles.map(f => `    <link rel="stylesheet" href="./assets/${f}">`).join('\n')

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />' + faviconTag,
    ...(cssFiles.length > 0 ? [linkTags] : []),
    '  </head>',
    '  <body>',
    '    <div id="root"></div>',
    `    <script type="module" src="./assets/${mainJs}"></script>`,
    '  </body>',
    '</html>',
    ''
  ].join('\n')

  writeFileSync(join(outDir, 'index.html'), html, 'utf-8')
  return true
}

// Rewrite root-relative asset paths (e.g. /assets/...) to relative (./assets/...)
// and strip crossorigin attributes so the output works when opened via file://.
// Vite adds crossorigin on <script>/<link> for CDN CORS — file:// has no CORS
// headers, so the browser blocks those assets unless the attribute is removed.
function rewriteHtmlAssetPaths(outDir: string): number {
  if (!existsSync(outDir)) return 0
  let count = 0
  for (const htmlFile of walkHtml(outDir)) {
    const content = readFileSync(htmlFile, 'utf-8')
    const updated = content
      .replace(/(href|src)="\/(?!\/)/g, '$1="./')
      .replace(/(href|src)='\/(?!\/)/g, "$1='./")
      .replace(/ crossorigin(?:="[^"]*"|='[^']*')?/g, '')
    if (updated !== content) {
      writeFileSync(htmlFile, updated, 'utf-8')
      count++
    }
  }
  return count
}

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

      const nitro = isNitroProject(dir)
      const nitroPubDir = join(dir, '.output', 'public')
      const targetDir = outputDir || defaultOutDir

      // Nitro/TanStack Start: never pass --outDir — the build pipeline ignores
      // it and may create a partial empty dir that blocks the fallback copy.
      if (nitro) {
        await runCmd(pm, ['run', 'build'], dir)
        if (existsSync(nitroPubDir)) {
          send(`> Nitro build — copying .output/public/ → ${targetDir}`, 'cmd')
          cpSync(nitroPubDir, targetDir, { recursive: true })
          if (existsSync(join(targetDir, 'index.html'))) {
            send(`  Prerendered HTML included`, 'out')
          } else if (generateFallbackIndexHtml(targetDir)) {
            send(`  Generated index.html (CSR shell — prerendering not detected)`, 'out')
          }
          send(`  Note: for full Cloudflare/Nitro deployment, use .output/ instead.`, 'out')
        }
      } else if (outputDir && framework === 'Vite') {
        // Regular Vite: pass --outDir so the build lands directly in the right place
        await runCmd(pm, ['run', 'build', '--', '--outDir', outputDir], dir)
      } else {
        await runCmd(pm, ['run', 'build'], dir)
        if (outputDir && outputDir !== defaultOutDir && existsSync(defaultOutDir)) {
          send(`> Copying output to ${outputDir}`, 'cmd')
          cpSync(defaultOutDir, outputDir, { recursive: true })
        }
      }

      const outLabel = targetDir
      send('> Rewriting HTML asset paths for file:// compatibility…', 'cmd')
      const rewritten = rewriteHtmlAssetPaths(outLabel)
      if (rewritten > 0) send(`  ✓ Patched ${rewritten} HTML file${rewritten > 1 ? 's' : ''}`, 'out')
      send(`✓ Done! Output → ${outLabel}`, 'done')
      if (repoUrl) send('  To push: git push -u origin main', 'done')
    } catch (err: unknown) {
      send(`✗ ${err instanceof Error ? err.message : String(err)}`, 'fail')
    }
  })()
})
