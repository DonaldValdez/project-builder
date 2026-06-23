import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  detectProject: (dir: string) => ipcRenderer.invoke('detect-project', dir),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('pick-folder'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  runPipeline: (opts: { dir: string; pm: string; framework: string; hasGit: boolean; repoUrl: string; outputDir: string }) =>
    ipcRenderer.send('run-pipeline', opts),
  onOutput: (cb: (data: { text: string; type: string }) => void) => {
    ipcRenderer.on('pipeline-output', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('pipeline-output')
  },
  onMenuOpenProject: (cb: (path: string) => void) => {
    ipcRenderer.on('menu-open-project', (_e, path) => cb(path))
    return () => ipcRenderer.removeAllListeners('menu-open-project')
  },
  onMenuRunBuild: (cb: () => void) => {
    ipcRenderer.on('menu-run-build', () => cb())
    return () => ipcRenderer.removeAllListeners('menu-run-build')
  },
  onMenuReset: (cb: () => void) => {
    ipcRenderer.on('menu-reset', () => cb())
    return () => ipcRenderer.removeAllListeners('menu-reset')
  },
  onMenuOpenOutput: (cb: () => void) => {
    ipcRenderer.on('menu-open-output', () => cb())
    return () => ipcRenderer.removeAllListeners('menu-open-output')
  }
})
