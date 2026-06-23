import { useCallback, useEffect, useRef, useState } from 'react'
import logoUrl from './assets/logo.svg'

declare global {
  interface Window {
    api: {
      detectProject: (dir: string) => Promise<{
        root?: string
        framework?: string
        packageManager?: string
        scripts?: string[]
        hasGit?: boolean
        error?: string
      }>
      pickFolder: () => Promise<string | null>
      openExternal: (url: string) => Promise<void>
      runPipeline: (opts: {
        dir: string; pm: string; framework: string
        hasGit: boolean; repoUrl: string; outputDir: string
      }) => void
      onOutput: (cb: (data: { text: string; type: string }) => void) => () => void
      onMenuOpenProject: (cb: (path: string) => void) => () => void
      onMenuRunBuild: (cb: () => void) => () => void
      onMenuReset: (cb: () => void) => () => void
      onMenuOpenOutput: (cb: () => void) => () => void
    }
  }
}

type Stage = 'drop' | 'config' | 'running' | 'done' | 'fail'

interface Detection {
  framework: string
  packageManager: string
  scripts: string[]
  hasGit: boolean
}

interface LogLine {
  text: string
  type: 'cmd' | 'out' | 'err' | 'done' | 'fail'
}

const SOCIALS = [
  { label: 'donaldvaldez.com', url: 'https://donaldvaldez.com', icon: '🌐' },
  { label: 'GitHub',           url: 'https://github.com/DonaldValdez',          icon: '⌥' },
  { label: 'LinkedIn',         url: 'https://linkedin.com/in/donaldvaldez',      icon: 'in' },
  { label: 'X',                url: 'https://x.com/donaldmvaldez',               icon: '𝕏' },
  { label: 'Email',            url: 'mailto:donaldmvaldez@gmail.com',            icon: '✉' },
]

function SocialBar() {
  const open = (url: string) => window.api.openExternal(url)
  return (
    <footer className="flex items-center justify-center gap-1 px-4 py-2 border-t border-slate-800 flex-wrap">
      <span className="text-slate-600 text-xs mr-2">Built by <span className="text-slate-400">Donald M. Valdez</span></span>
      {SOCIALS.map(s => (
        <button
          key={s.label}
          onClick={() => open(s.url)}
          title={s.label}
          className="text-slate-500 hover:text-indigo-400 transition-colors text-xs px-2 py-1 rounded hover:bg-slate-800"
        >
          <span className="mr-1 opacity-70">{s.icon}</span>{s.label}
        </button>
      ))}
    </footer>
  )
}

export default function App() {
  const [stage, setStage] = useState<Stage>('drop')
  const [dragging, setDragging] = useState(false)
  const [projectDir, setProjectDir] = useState('')
  const [pathInput, setPathInput] = useState('')
  const [detection, setDetection] = useState<Detection | null>(null)
  const [repoName, setRepoName] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [log, setLog] = useState<LogLine[]>([])
  const [error, setError] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const handleRunRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const analyze = useCallback(async (dir: string) => {
    setError('')
    const result = await window.api.detectProject(dir)
    if (result.error) { setError(result.error); return }
    setProjectDir((result as Detection & { root: string }).root ?? dir)
    setDetection(result as Detection)
    setStage('config')
  }, [])

  // Menu bar event bindings
  useEffect(() => {
    const u1 = window.api.onMenuOpenProject((path) => analyze(path))
    const u2 = window.api.onMenuRunBuild(() => {
      if (detection) handleRunRef.current?.()
    })
    const u3 = window.api.onMenuReset(() => reset())
    const u4 = window.api.onMenuOpenOutput(() => {
      const out = outputDir.trim() || (projectDir ? `${projectDir}\\dist` : '')
      if (out) window.api.openExternal(`file:///${out.replace(/\\/g, '/')}`)
    })
    return () => { u1(); u2(); u3(); u4() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyze, detection, outputDir, projectDir])

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const dropped = files[0] as File & { path: string }
      if (dropped.path) analyze(dropped.path)
    }
  }

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pathInput.trim()) analyze(pathInput.trim())
  }

  const handleRun = () => {
    if (!detection) return
    setLog([])
    setStage('running')

    const repoUrl = repoName.trim()
      ? `https://github.com/${repoName.trim().includes('/') ? repoName.trim() : `DonaldValdez/${repoName.trim()}`}.git`
      : ''

    const cleanup = window.api.onOutput(({ text, type }) => {
      setLog(prev => [...prev, { text: text.trimEnd(), type: type as LogLine['type'] }])
      if (type === 'done') { setStage('done'); cleanup() }
      if (type === 'fail') { setStage('fail'); cleanup() }
    })

    window.api.runPipeline({
      dir: projectDir,
      pm: detection.packageManager,
      framework: detection.framework,
      hasGit: detection.hasGit,
      repoUrl,
      outputDir: outputDir.trim()
    })
  }

  // Keep ref current so menu binding always calls the latest version
  handleRunRef.current = handleRun

  const reset = () => {
    setStage('drop')
    setProjectDir('')
    setPathInput('')
    setDetection(null)
    setRepoName('')
    setOutputDir('')
    setLog([])
    setError('')
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-900">

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-5 py-3 border-b border-slate-800 select-none">
        <img src={logoUrl} alt="Project Builder" className="h-9 w-auto" />
        {stage !== 'drop' && (
          <button onClick={reset} className="ml-auto text-xs text-slate-400 hover:text-slate-200 transition-colors">
            ← Start over
          </button>
        )}
      </header>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 gap-6">

        {/* DROP ZONE */}
        {stage === 'drop' && (
          <div className="w-full max-w-xl flex flex-col gap-4">
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`
                w-full h-52 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all cursor-default
                ${dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-700 hover:border-slate-500 bg-slate-800/50'}
              `}
            >
              <div className="text-4xl">📁</div>
              <p className="text-slate-300 font-medium">Drop your project folder here</p>
              <p className="text-slate-500 text-sm">or paste the path below</p>
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <form onSubmit={handlePathSubmit} className="flex gap-2">
              <input
                value={pathInput}
                onChange={e => setPathInput(e.target.value)}
                placeholder="C:\path\to\your\project"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={async () => {
                  const picked = await window.api.pickFolder()
                  if (picked) analyze(picked)
                }}
                className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap"
              >
                Browse…
              </button>
              <button
                type="submit"
                className="bg-indigo-500 hover:bg-indigo-400 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                Analyze
              </button>
            </form>
          </div>
        )}

        {/* CONFIG PANEL */}
        {stage === 'config' && detection && (
          <div className="w-full max-w-xl flex flex-col gap-5">
            <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Detected</p>
              <div className="grid grid-cols-2 gap-3">
                <Chip label="Framework"      value={detection.framework} />
                <Chip label="Package manager" value={detection.packageManager} />
                <Chip label="Git"            value={detection.hasGit ? 'Already initialized' : 'Will init'} />
                <Chip label="Build script"   value={detection.scripts.includes('build') ? `${detection.packageManager} run build` : detection.scripts[0] ?? 'none'} />
              </div>
              <p className="text-xs text-slate-500 truncate mt-1">{projectDir}</p>
            </div>

            {/* Output folder */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-400">
                Output folder <span className="text-slate-600">(optional — defaults to <code className="text-slate-500">dist/</code> inside project)</span>
              </label>
              <div className="flex gap-2">
                <input
                  value={outputDir}
                  onChange={e => setOutputDir(e.target.value)}
                  placeholder={`${projectDir}\\dist`}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const picked = await window.api.pickFolder()
                    if (picked) setOutputDir(picked)
                  }}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap"
                >
                  Browse…
                </button>
              </div>
            </div>

            {/* GitHub repo */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-400">GitHub repo <span className="text-slate-600">(optional)</span></label>
              <input
                value={repoName}
                onChange={e => setRepoName(e.target.value)}
                placeholder="DonaldValdez/my-project"
                className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <button
              onClick={handleRun}
              className="w-full bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Run Setup + Build →
            </button>
          </div>
        )}

        {/* OUTPUT PANEL */}
        {(stage === 'running' || stage === 'done' || stage === 'fail') && (
          <div className="w-full max-w-2xl flex flex-col gap-4">
            <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
              stage === 'running' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
              stage === 'done'    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                                   'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}>
              {stage === 'running' && '⏳ Running pipeline…'}
              {stage === 'done'    && '✅ Build complete!'}
              {stage === 'fail'    && '❌ Pipeline failed — see output below'}
            </div>

            <div
              ref={logRef}
              className="bg-slate-950 rounded-xl p-4 h-72 overflow-y-auto font-mono text-xs leading-relaxed"
            >
              {log.map((line, i) => (
                <div key={i} className={
                  line.type === 'cmd'  ? 'text-indigo-300 mt-2 first:mt-0' :
                  line.type === 'err'  ? 'text-yellow-400' :
                  line.type === 'done' ? 'text-emerald-400 font-semibold mt-2' :
                  line.type === 'fail' ? 'text-red-400 font-semibold mt-2' :
                                         'text-slate-400'
                }>
                  {line.text}
                </div>
              ))}
              {stage === 'running' && (
                <span className="inline-block w-2 h-3.5 bg-slate-400 animate-pulse ml-0.5 align-middle" />
              )}
            </div>

            {stage !== 'running' && (
              <button onClick={reset} className="text-sm text-slate-400 hover:text-slate-200 transition-colors self-center">
                ← Build another project
              </button>
            )}
          </div>
        )}
      </main>

      {/* ── Footer / Social bar ── */}
      <SocialBar />
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-200 font-medium">{value}</span>
    </div>
  )
}
