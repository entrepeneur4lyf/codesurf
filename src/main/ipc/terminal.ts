import { ipcMain, WebContents } from 'electron'
import { existsSync, chmodSync } from 'fs'
import { promises as fsP } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { bus } from '../event-bus'
import { writeMCPConfigToWorkspace } from '../mcp-server'
import { CONTEX_HOME, workspaceTileDir, legacyWorkspaceTileDir } from '../paths'

function ensureNodePtySpawnHelperExecutable(): void {
  const candidates = [
    join(__dirname, '../../node_modules/node-pty/build/Release/spawn-helper'),
    join(__dirname, '../../node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper'),
    join(__dirname, '../../node_modules/node-pty/prebuilds/darwin-x64/spawn-helper'),
    join(__dirname, '../../node_modules/node-pty/prebuilds/linux-x64/spawn-helper'),
    join(__dirname, '../../node_modules/node-pty/prebuilds/linux-arm64/spawn-helper'),
    join(process.cwd(), 'node_modules/node-pty/build/Release/spawn-helper'),
    join(process.cwd(), 'node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper'),
    join(process.cwd(), 'node_modules/node-pty/prebuilds/darwin-x64/spawn-helper'),
    join(process.cwd(), 'node_modules/node-pty/prebuilds/linux-x64/spawn-helper'),
    join(process.cwd(), 'node_modules/node-pty/prebuilds/linux-arm64/spawn-helper'),
  ]

  let found = false
  for (const helperPath of candidates) {
    try {
      if (!existsSync(helperPath)) continue
      found = true
      chmodSync(helperPath, 0o755)
    } catch {
      // best-effort only
    }
  }
  if (!found) {
    console.warn('node-pty spawn-helper: no candidates found among checked paths')
  }
}

ensureNodePtySpawnHelperExecutable()

// --- Security: binary allowlist for pty spawn (SEC-04) ---
const ALLOWED_SHELLS = new Set([
  '/bin/bash', '/bin/zsh', '/bin/sh', '/usr/bin/bash', '/usr/bin/zsh',
  '/usr/local/bin/bash', '/usr/local/bin/zsh', '/usr/local/bin/fish',
  '/opt/homebrew/bin/bash', '/opt/homebrew/bin/zsh', '/opt/homebrew/bin/fish',
])

// Also allow the user's default shell
const userShell = process.env.SHELL
if (userShell) ALLOWED_SHELLS.add(userShell)

// Known agent CLIs that are allowed to be spawned directly
const ALLOWED_AGENT_BINS = ['claude', 'codex', 'aider', 'opencode']

function isAllowedBinary(bin: string): boolean {
  // Allow known shells
  if (ALLOWED_SHELLS.has(bin)) return true
  // Allow known agent CLIs (matched by basename)
  const base = bin.split('/').pop() || ''
  if (ALLOWED_AGENT_BINS.includes(base)) return true
  return false
}

// node-pty must be required (not imported) due to native module ESM issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pty = require('node-pty')

function expandHome(arg: string): string {
  if (!arg.startsWith('~')) return arg
  const home = homedir()
  if (arg === '~') return home

  // Backward compatibility: older builds passed ~/.contex..., while runtime
  // config now lives in ~/.contex. Keep both working.
  if (arg.startsWith('~/.contex/')) {
    return join(home, '.contex', arg.slice('~/.contex/'.length))
  }
  if (arg.startsWith('~\\.contex\\')) {
    return join(home, '.contex', arg.slice('~\\.contex\\'.length))
  }

  if (arg.startsWith('~/') || arg.startsWith('~\\')) return join(home, arg.slice(2))
  return arg
}

interface PtyInstance {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
  onData: (cb: (data: string) => void) => void
}

interface TerminalSession {
  pty: PtyInstance
  listeners: Set<WebContents>
  buffer: string
}

const terminals = new Map<string, TerminalSession>()
const terminalBuffers = new Map<string, { data: string; timer: ReturnType<typeof setTimeout> | undefined }>()
const TERMINAL_BUS_DEBOUNCE = 800 // ms

function flushTerminalToBus(tileId: string): void {
  const buf = terminalBuffers.get(tileId)
  if (!buf || !buf.data) return
  const data = buf.data
  buf.data = ''
  // Strip ANSI for the bus event
  const clean = data.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim()
  if (!clean) return
  const truncated = clean.length > 200 ? clean.slice(-200) : clean
  bus.publish({
    channel: `tile:${tileId}`,
    type: 'activity',
    source: `terminal:${tileId}`,
    payload: { output: truncated }
  })
}

export function registerTerminalIPC(): void {
  ipcMain.handle('terminal:create', async (event, tileId: string, workspaceDir: string, launchBin?: string, launchArgs?: string[]) => {
    const existing = terminals.get(tileId)
    if (existing) {
      existing.listeners.add(event.sender)
      event.sender.once('destroyed', () => {
        existing.listeners.delete(event.sender)
      })
      return { cols: 80, rows: 24, buffer: existing.buffer }
    }

    // If a binary is specified, validate it against the allowlist (SEC-04)
    if (launchBin && !isAllowedBinary(launchBin)) {
      console.warn(`[terminal] Blocked non-allowlisted binary: ${launchBin} — falling back to default shell`)
      launchBin = undefined
    }

    // If a binary is specified, spawn it directly (no shell wrapper)
    const bin = launchBin || process.env.SHELL || '/bin/zsh'
    const args = launchBin ? (launchArgs ?? []).map(expandHome) : []

    // Check if we should inject MCP config for agent CLIs
    const agentBins = ['claude', 'codex', 'aider', 'opencode']
    const isAgent = launchBin && agentBins.some(a => launchBin.includes(a))
    const spawnEnv: Record<string, string> = { ...process.env as Record<string, string>, CARD_ID: tileId }

    // Set CONTEX_DIR so agents know where their per-tile .contex folder is
    const contexDir = workspaceTileDir(workspaceDir, tileId)
    const legacyContexDir = legacyWorkspaceTileDir(workspaceDir, tileId)
    spawnEnv.CONTEX_DIR = contexDir
    spawnEnv.COLLAB_DIR = contexDir

    if (isAgent) {
      const mcpConfigPath = join(CONTEX_HOME, 'mcp-server.json')
      spawnEnv.CONTEX_MCP_CONFIG = mcpConfigPath

      // Ensure .contex dir exists before reading/spawning
      await fsP.mkdir(join(contexDir, 'context'), { recursive: true })

      // Inject objective.md via -p if it exists
      const objectivePath = join(contexDir, 'objective.md')
      let objective = ''
      try {
        objective = await fsP.readFile(objectivePath, 'utf8')
      } catch { /* no objective yet */ }

      // Always inject a preamble so the agent knows about its .contex folder
      const preamble = [
        objective.trim() || '# Objective\n\nAwaiting tasks from the contex drawer.',
        '',
        '## Contex Directory',
        `Your per-tile directory is at: ${contexDir}`,
        `Legacy path (if you see old docs): ${legacyContexDir}`,
        `Check ${contexDir}/objective.md for updated objectives.`,
        `Use the reload_objective MCP tool to fetch the latest version.`,
      ].join('\n')
      args.push('-p', preamble)

      // Read skills.json to filter --allowedTools
      let skillFilter: string[] | null = null
      try {
        const skillsRaw = await fsP.readFile(join(contexDir, 'skills.json'), 'utf8')
        const skills = JSON.parse(skillsRaw) as { enabled?: string[]; disabled?: string[] }
        if (skills.disabled && skills.disabled.length > 0) {
          skillFilter = skills.disabled
        }
      } catch { /* no skills config */ }

      // Auto-allow contex MCP tools for Claude Code CLI launches
      const isClaude = launchBin.includes('claude')
      if (isClaude) {
        const mcpToolNames = [
          'mcp__contex__canvas_create_tile', 'mcp__contex__canvas_open_file',
          'mcp__contex__canvas_pan_to', 'mcp__contex__canvas_list_tiles',
          'mcp__contex__card_complete', 'mcp__contex__card_update',
          'mcp__contex__card_error', 'mcp__contex__canvas_event',
          'mcp__contex__request_input', 'mcp__contex__update_progress',
          'mcp__contex__log_activity', 'mcp__contex__create_task',
          'mcp__contex__update_task', 'mcp__contex__notify',
          'mcp__contex__ask',
          // Collab tools
          'mcp__contex__reload_objective', 'mcp__contex__pause_task',
          'mcp__contex__get_context',
        ]
        // Filter out disabled skills from allowed tools
        const filteredTools = skillFilter
          ? mcpToolNames.filter(t => !skillFilter!.some(d => t.includes(d)))
          : mcpToolNames
        args.push('--allowedTools', filteredTools.join(','))
      }

      bus.publish({
        channel: `tile:${tileId}`,
        type: 'system',
        source: `terminal:${tileId}`,
        payload: { action: 'agent_launched', agent: launchBin }
      })
    }

    // Ensure .mcp.json exists in workspace so Claude Code auto-discovers contex tools
    writeMCPConfigToWorkspace(workspaceDir).catch(() => {})

    const term: PtyInstance = pty.spawn(bin, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: workspaceDir,
      env: spawnEnv
    })

    const session: TerminalSession = {
      pty: term,
      listeners: new Set([event.sender]),
      buffer: ''
    }
    terminals.set(tileId, session)
    event.sender.once('destroyed', () => {
      session.listeners.delete(event.sender)
    })

    bus.publish({
      channel: `tile:${tileId}`,
      type: 'system',
      source: `terminal:${tileId}`,
      payload: { action: 'created', workspaceDir }
    })

    term.onData((data: string) => {
      session.buffer = (session.buffer + data).slice(-200000)
      for (const listener of [...session.listeners]) {
        try {
          if (!listener.isDestroyed()) {
            listener.send(`terminal:data:${tileId}`, data)
            listener.send(`terminal:active:${tileId}`)
          } else {
            session.listeners.delete(listener)
          }
        } catch {
          session.listeners.delete(listener)
        }
      }

      // Accumulate and debounce terminal output to bus
      let buf = terminalBuffers.get(tileId)
      if (!buf) {
        buf = { data: '', timer: undefined }
        terminalBuffers.set(tileId, buf)
      }
      buf.data += data
      if (buf.timer) clearTimeout(buf.timer)
      buf.timer = setTimeout(() => flushTerminalToBus(tileId), TERMINAL_BUS_DEBOUNCE)
    })

    return { cols: 80, rows: 24, buffer: '' }
  })

  ipcMain.handle('terminal:write', (_, tileId: string, data: string) => {
    terminals.get(tileId)?.pty.write(data)
  })

  ipcMain.handle('terminal:resize', (_, tileId: string, cols: number, rows: number) => {
    if (cols > 0 && rows > 0) {
      terminals.get(tileId)?.pty.resize(Math.floor(cols), Math.floor(rows))
    }
  })

  ipcMain.handle('terminal:destroy', (_, tileId: string) => {
    const session = terminals.get(tileId)
    if (session) {
      try { session.pty.kill() } catch { /* ignore */ }
      terminals.delete(tileId)
    }
    bus.publish({
      channel: `tile:${tileId}`,
      type: 'system',
      source: `terminal:${tileId}`,
      payload: { action: 'destroyed' }
    })
    // Clean up buffer
    const buf = terminalBuffers.get(tileId)
    if (buf?.timer) clearTimeout(buf.timer)
    terminalBuffers.delete(tileId)
  })
}
