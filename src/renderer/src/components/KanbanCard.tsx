import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useDetectedAgents } from '../hooks/useDetectedAgents'
import { useMCPServers } from '../hooks/useMCPServers'
import { useAppFonts } from '../FontContext'
import { useTheme } from '../ThemeContext'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MCPServer {
  name: string
  url?: string
  cmd?: string
}

export interface KanbanCardData {
  id: string
  title: string
  description: string
  instructions: string
  columnId: string
  color: string
  linkedTileId?: string
  linkedTileType?: string
  linkedGroupId?: string
  linkedTileIds?: string[]
  justMoved?: boolean
  agent: string
  model?: string
  mcpConfig?: string
  mcpServers: MCPServer[]
  tools: string[]
  skillsAndCommands: string[]
  fileRefs: string[]
  cardRefs: string[]
  hooks: string[]
  launched: boolean
  briefPath?: string
  comments: Comment[]
  attachments: Attachment[]
}

interface Comment { id: string; text: string; ts: number }
interface Attachment { id: string; name: string; path: string }

export interface DetectedAgent {
  id: string
  label: string
  cmd: string
  path?: string
  version?: string
  available: boolean
}

export const AGENTS: DetectedAgent[] = [
  { id: 'shell',  label: 'Shell',  cmd: 'zsh',    available: true },
  { id: 'claude', label: 'Claude', cmd: 'claude', available: false },
  { id: 'codex',  label: 'Codex',  cmd: 'codex',  available: false },
]

export const MODELS: Record<string, string[]> = {
  claude:   ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5'],
  codex:    ['gpt-4.1', 'o4-mini', 'o3'],
  gemini:   ['gemini-2.5-pro', 'gemini-2.5-flash'],
  opencode: ['claude-sonnet-4-5', 'gpt-4.1'],
  shell:    []
}

const MCP_CONFIG = '~/.contex/mcp-server.json'
const BUILTIN_TOOLS = ['read', 'write', 'edit', 'bash', 'computer', 'web_search', 'browser']

function resolveMcpConfigPath(input: string): string {
  if (!input.startsWith('~')) return input
  const home = (window as any).process?.env?.HOME
  if (!home) return input
  if (input === '~') return home
  if (input.startsWith('~/.contex/')) {
    return `${home}/.contex/${input.slice('~/.contex/'.length)}`
  }
  if (input.startsWith('~\\.contex\\')) {
    return `${home}/.contex/${input.slice('~\\.contex\\'.length)}`
  }
  return `${home}/${input.slice(2)}`
}

type Tab = 'overview' | 'terminal' | 'notes'

// ─── Build launch command ─────────────────────────────────────────────────────

export function buildLaunchCmd(card: KanbanCardData, briefPath?: string, agentPath?: string): string {
  if (card.agent === 'shell' || !card.agent) return ''
  const bin = agentPath ?? card.agent
  const parts: string[] = [bin]
  if (card.model) parts.push(`--model ${card.model}`)
  const mcpConfigPath = resolveMcpConfigPath(card.mcpConfig ?? MCP_CONFIG)
  parts.push(`--mcp-config "${mcpConfigPath}"`)
  if (briefPath) {
    if (card.agent === 'claude') parts.push(`--print "$(cat ${briefPath})"`)
    else if (card.agent === 'codex') parts.push(`exec "$(cat ${briefPath})"`)
  } else if (card.instructions) {
    const esc = card.instructions.replace(/"/g, '\\"').replace(/\n/g, '\\n')
    if (card.agent === 'claude') parts.push(`--print "${esc}"`)
    else if (card.agent === 'codex') parts.push(`exec "${esc}"`)
  }
  if (card.hooks.length) return card.hooks.join(' && ') + ' && ' + parts.join(' ')
  return parts.join(' ')
}

// ─── Mini terminal ────────────────────────────────────────────────────────────

function parseLaunchCmd(cmd: string): { bin: string; args: string[] } {
  const tokens: string[] = []
  let cur = '', inQ: '"' | "'" | null = null
  for (const c of cmd) {
    if (inQ) { c === inQ ? (inQ = null) : (cur += c) }
    else if (c === '"' || c === "'") { inQ = c }
    else if (c === ' ') { if (cur) { tokens.push(cur); cur = '' } }
    else { cur += c }
  }
  if (cur) tokens.push(cur)
  return { bin: tokens[0] ?? '', args: tokens.slice(1) }
}

function MiniTerminal({ termId, workspaceDir, launchCmd }: {
  termId: string; workspaceDir: string; launchCmd?: string
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)
  const parsed = launchCmd ? parseLaunchCmd(launchCmd) : null
  const fonts = useAppFonts()
  const theme = useTheme()

  useEffect(() => {
    if (!ref.current || mounted.current) return
    mounted.current = true
    let aborted = false
    let asyncCleanup: (() => void) | undefined

    const term = new Terminal({
      theme: {
        background: theme.terminal.background,
        foreground: theme.terminal.foreground,
        cursor: theme.terminal.cursor,
        black: theme.terminal.black,
        red: theme.terminal.red,
        green: theme.terminal.green,
        yellow: theme.terminal.yellow,
        blue: theme.terminal.blue,
        magenta: theme.terminal.magenta,
        cyan: theme.terminal.cyan,
        white: theme.terminal.white,
        brightBlack: theme.terminal.brightBlack,
        brightRed: theme.terminal.brightRed,
        brightGreen: theme.terminal.brightGreen,
        brightYellow: theme.terminal.brightYellow,
        brightBlue: theme.terminal.brightBlue,
        brightMagenta: theme.terminal.brightMagenta,
        brightCyan: theme.terminal.brightCyan,
        brightWhite: theme.terminal.brightWhite,
        selectionBackground: theme.terminal.selection,
      },
      overviewRuler: {
        width: 10
      },
      fontFamily: fonts.mono,
      fontSize: 11, lineHeight: 1.3, cursorBlink: true,
      allowProposedApi: true, scrollback: 5000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(ref.current)
    const ro = new ResizeObserver(() => { try { fit.fit() } catch { /**/ } })
    ro.observe(ref.current)
    requestAnimationFrame(() => requestAnimationFrame(() => { try { fit.fit() } catch { /**/ } }))
    const cp = parsed?.bin
      ? window.electron.terminal.create(termId, workspaceDir, parsed.bin, parsed.args)
      : window.electron.terminal.create(termId, workspaceDir)
    cp.then(() => {
      if (aborted) return  // Component already unmounted — don't wire up listeners

      const dataCleanup = window.electron.terminal.onData(termId, d => term.write(d))
      term.onData(d => window.electron.terminal.write(termId, d))
      term.onResize(({ cols, rows }) => window.electron.terminal.resize(termId, cols, rows))

      asyncCleanup = () => { dataCleanup(); ro.disconnect() }
    }).catch(err => {
      if (!aborted) term.write(`\x1b[31m${err?.message ?? err}\x1b[0m\r\n`)
    })
    return () => {
      aborted = true
      mounted.current = false
      asyncCleanup?.()
      ro.disconnect()
      window.electron.terminal.destroy(termId)
      term.dispose()
    }
  }, [termId, workspaceDir])

  return <div ref={ref} style={{ width: '100%', height: '100%', background: theme.terminal.background }} />
}

// ─── KanbanCard ───────────────────────────────────────────────────────────────

interface Props {
  card: KanbanCardData
  workspaceDir: string
  active: boolean
  dragging: boolean
  isRunning: boolean
  allCards: KanbanCardData[]
  onUpdate: (id: string, patch: Partial<KanbanCardData>) => void
  onRemove: (id: string) => void
  onLaunch: (id: string) => void
  onFocus?: () => void
  onDragStart: () => void
  onDragEnd: () => void
}

export function KanbanCard({
  card, workspaceDir, active, dragging, isRunning, allCards,
  onUpdate, onRemove, onLaunch, onFocus, onDragStart, onDragEnd
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [advanced, setAdvanced] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [newNote, setNewNote] = useState('')

  const detectedAgents = useDetectedAgents()
  const mcpServers = useMCPServers()
  const fonts = useAppFonts()
  const theme = useTheme()
  const availableAgents = detectedAgents.length > 0 ? detectedAgents : AGENTS
  const agentInfo = availableAgents.find(a => a.id === card.agent)
  const termId = `kterm-${card.id}`
  const launchCmd = card.agent !== 'shell' ? buildLaunchCmd(card, card.briefPath, agentInfo?.path) : undefined

  // All available tools = built-ins + every enabled MCP server
  const toolSuggestions = [
    ...BUILTIN_TOOLS,
    ...mcpServers.map(s => s.name)
  ]
  const cardSuggestions = allCards.filter(c => c.id !== card.id).map(c => c.title)

  useEffect(() => {
    if (card.launched) { setExpanded(true); setTab('terminal') }
  }, [card.launched])

  const addNote = () => {
    if (!newNote.trim()) return
    onUpdate(card.id, { comments: [...card.comments, { id: `n-${Date.now()}`, text: newNote.trim(), ts: Date.now() }] })
    setNewNote('')
  }

  const TERM_H = 240

  return (
    <div
      draggable={!expanded}
      onDragStart={e => {
        if (card.linkedTileId) {
          e.dataTransfer.setData('application/tile-id', card.linkedTileId)
          e.dataTransfer.setData('application/tile-type', card.linkedTileType ?? '')
          e.dataTransfer.setData('application/tile-label', card.title)
          e.dataTransfer.effectAllowed = 'link'
        } else {
          e.dataTransfer.setData('application/card-title', card.title)
          e.dataTransfer.effectAllowed = 'copy'
        }
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault(); e.stopPropagation(); setDragOver(false)
        // Group drop
        const groupId = e.dataTransfer.getData('application/group-id')
        if (groupId) {
          let tileIds: string[] = []
          try { tileIds = JSON.parse(e.dataTransfer.getData('application/group-tile-ids') || '[]') } catch { /**/ }
          onUpdate(card.id, {
            linkedGroupId: groupId,
            linkedTileIds: tileIds,
            title: e.dataTransfer.getData('application/group-label') || card.title
          })
          return
        }
        // Tile drop
        const tileId = e.dataTransfer.getData('application/tile-id')
        if (tileId) {
          onUpdate(card.id, { linkedTileId: tileId, linkedTileType: e.dataTransfer.getData('application/tile-type'), title: e.dataTransfer.getData('application/tile-label') || card.title })
          return
        }
        const filePath = e.dataTransfer.getData('text/plain')
        if (filePath) {
          const name = filePath.split('/').pop() ?? filePath
          onUpdate(card.id, {
            fileRefs: [...card.fileRefs, filePath],
            attachments: [...card.attachments, { id: `a-${Date.now()}`, name, path: filePath }]
          })
        }
      }}
      style={{
        borderRadius: 8, background: card.color, flexShrink: 0,
        border: `1px solid ${dragOver ? theme.accent.base : card.justMoved ? theme.status.success : expanded ? theme.border.strong : hovered ? theme.border.default : theme.border.subtle}`,
        opacity: dragging ? 0.3 : 1,
        boxShadow: card.justMoved ? `0 0 12px ${theme.status.success}66` : expanded ? theme.shadow.panel : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s', overflow: 'hidden',
        outline: dragOver ? `1px dashed ${theme.accent.base}44` : 'none'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Collapsed header ── */}
      <div
        style={{
          padding: '8px 10px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: theme.surface.hover,
          borderBottom: `1px solid ${theme.border.default}`
        }}
        onClick={() => setExpanded(p => !p)}
      >
        {/* Status indicator */}
        {card.launched ? (
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: active ? theme.status.success : theme.border.strong,
            boxShadow: active ? `0 0 6px ${theme.status.success}` : 'none',
            transition: 'background 0.3s, box-shadow 0.3s'
          }} />
        ) : (
          <span style={{ fontSize: 9, color: theme.text.disabled, fontFamily: 'inherit', flexShrink: 0 }}>
            {expanded ? 'v' : '>'}
          </span>
        )}

        {/* Title */}
        <span style={{
          fontSize: 13, fontWeight: 600, color: theme.text.primary, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {card.title}
        </span>

        {/* Agent pill */}
        {card.agent !== 'shell' && (
          <span style={{
            fontSize: 9, fontFamily: 'inherit', flexShrink: 0,
            color: card.launched ? (active ? theme.status.success : theme.text.disabled) : theme.text.disabled,
            background: theme.surface.panelMuted, border: `1px solid ${theme.border.subtle}`,
            borderRadius: 10, padding: '1px 7px',
            transition: 'color 0.3s'
          }}>
            {agentInfo?.label ?? card.agent}
            {card.model && <span style={{ opacity: 0.5 }}> · {card.model.split('-').pop()}</span>}
          </span>
        )}

        {/* Hover actions */}
        {hovered && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            {onFocus && <Btn onClick={onFocus} color={theme.accent.base}>go</Btn>}
            {!card.launched && card.agent !== 'shell' && <Btn onClick={() => onLaunch(card.id)} color={theme.status.success}>run</Btn>}
            <Btn onClick={() => onRemove(card.id)} color={theme.status.danger}>x</Btn>
          </div>
        )}
      </div>

      {/* Collapsed summary strip */}
      {!expanded && (
        <div style={{ padding: '0 10px 8px 25px' }}>
          {card.description && (
            <div style={{ fontSize: 11, color: theme.text.muted, marginBottom: 5, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
              {card.description}
            </div>
          )}
          {/* Context chips */}
          {(card.tools.length > 0 || card.skillsAndCommands.length > 0 || card.fileRefs.length > 0) && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {card.tools.map(t => <Chip key={t} label={t} prefix="@" bg="#0d2137" fg="#58a6ff" />)}
              {card.skillsAndCommands.map(s => <Chip key={s} label={s} prefix="/" bg="#0d2a1a" fg="#3fb950" />)}
              {card.fileRefs.map(f => <Chip key={f} label={f.split('/').pop() ?? f} prefix="@" bg="#1a1508" fg="#d7ba7d" />)}
              {card.cardRefs.map(r => <Chip key={r} label={r} prefix="@" bg="#1a0d2a" fg="#c586c0" />)}
            </div>
          )}
        </div>
      )}

      {/* ── Expanded ── */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${theme.border.subtle}`, position: 'relative' }}>

          {/* Collapse button — always visible when expanded */}
          <div style={{ position: 'absolute', top: 6, right: 8, zIndex: 20 }}>
            <button
              onClick={e => { e.stopPropagation(); setExpanded(false) }}
              style={{ fontSize: 10, color: theme.text.disabled, background: theme.surface.panel, border: `1px solid ${theme.border.subtle}`, borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.4 }}
              onMouseEnter={e => { e.currentTarget.style.color = theme.text.primary; e.currentTarget.style.borderColor = theme.border.default }}
              onMouseLeave={e => { e.currentTarget.style.color = theme.text.disabled; e.currentTarget.style.borderColor = theme.border.subtle }}
              title="Collapse"
            >
              ^
            </button>
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', background: theme.surface.panel, borderBottom: `1px solid ${theme.border.subtle}`, alignItems: 'center', gap: 4, padding: '6px 8px' }}>
            {(['overview', ...(card.launched ? ['terminal'] : []), 'notes'] as Tab[]).map(t => {
              const isActive = tab === t
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    height: 28,
                    padding: '0 11px',
                    fontSize: 11,
                    border: `1px solid ${isActive ? theme.border.default : 'transparent'}`,
                    borderRadius: 7,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: isActive ? theme.surface.selection : 'transparent',
                    color: isActive ? theme.accent.base : theme.text.muted,
                    textTransform: 'uppercase',
                    transition: 'color 0.15s, background 0.15s, border-color 0.15s',
                    fontWeight: isActive ? 700 : 500,
                    letterSpacing: 0.3,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = theme.surface.hover
                      e.currentTarget.style.color = theme.text.secondary
                      e.currentTarget.style.borderColor = theme.border.default
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = theme.text.muted
                      e.currentTarget.style.borderColor = 'transparent'
                    }
                  }}
                >
                  {t}{t === 'notes' && card.comments.length ? ` (${card.comments.length})` : ''}
                </button>
              )
            })}
            <div style={{ flex: 1 }} />
            {card.launched && (
              <span style={{ fontSize: 9, color: active ? theme.status.success : theme.text.disabled, padding: '0 8px', fontFamily: 'inherit', transition: 'color 0.3s', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {active ? 'active' : 'idle'}
              </span>
            )}
          </div>

          {/* ── Overview tab ── */}
          {tab === 'overview' && (
            <div style={{ background: theme.surface.panel, overflowY: 'auto', maxHeight: 480 }}>

              {/* Task summary */}
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${theme.border.subtle}` }}>
                {/* Editable title */}
                <input
                  value={card.title}
                  onChange={e => onUpdate(card.id, { title: e.target.value })}
                  style={{ ...getTitleInputStyle(theme), marginBottom: 8 }}
                  placeholder="Task title"
                />
                {/* Description */}
                <textarea
                  value={card.description}
                  onChange={e => onUpdate(card.id, { description: e.target.value })}
                  rows={2}
                  placeholder="What needs to be done…"
                  style={getTextareaStyle(theme)}
                />
              </div>

              {/* Instructions */}
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border.subtle}` }}>
                <Label>Instructions</Label>
                <textarea
                  value={card.instructions}
                  onChange={e => onUpdate(card.id, { instructions: e.target.value })}
                  rows={5}
                  placeholder="Full prompt for the agent. Be specific. Reference files, describe expected output, list constraints."
                  style={getTextareaStyle(theme)}
                />
              </div>

              {/* Context */}
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border.subtle}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Label>Context</Label>
                <ChipInput values={card.tools} onChange={v => onUpdate(card.id, { tools: v })}
                  prefix="@" placeholder="tools — type or pick"
                  suggestions={toolSuggestions}
                  suggestionMeta={Object.fromEntries(mcpServers.map(s => [s.name, s.description ?? '']))}
                  sublabel="Tools" />
                <ChipInput values={card.skillsAndCommands} onChange={v => onUpdate(card.id, { skillsAndCommands: v })}
                  prefix="/" placeholder="skills, commands" sublabel="Skills & Commands" />
                <ChipInput values={card.fileRefs} onChange={v => onUpdate(card.id, { fileRefs: v })}
                  prefix="@" placeholder="file paths — or drop from sidebar"
                  sublabel="Files"
                  onDropFile={path => onUpdate(card.id, {
                    fileRefs: [...card.fileRefs, path],
                    attachments: [...card.attachments, { id: `a-${Date.now()}`, name: path.split('/').pop() ?? path, path }]
                  })} />
                <ChipInput values={card.cardRefs} onChange={v => onUpdate(card.id, { cardRefs: v })}
                  prefix="@" placeholder="other cards" suggestions={cardSuggestions} sublabel="Related cards" />
              </div>

              {/* Agent selector */}
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border.subtle}` }}>
                <Label>Agent</Label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {availableAgents.filter(a => a.available || a.id === card.agent).map(a => (
                    <button key={a.id} onClick={() => onUpdate(card.id, { agent: a.id, model: undefined })}
                      style={{
                        padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                        fontFamily: 'inherit', fontWeight: 500,
                        background: card.agent === a.id ? theme.accent.base : theme.surface.panelMuted,
                        color: card.agent === a.id ? theme.text.inverse : theme.text.muted,
                        border: `1px solid ${card.agent === a.id ? theme.border.accent : theme.border.subtle}`,
                      }}
                    >
                      {a.label}
                      {a.version && <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 5 }}>{a.version}</span>}
                    </button>
                  ))}
                </div>
                {/* Model pills */}
                {card.agent !== 'shell' && MODELS[card.agent]?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {MODELS[card.agent].map(m => (
                      <button key={m} onClick={() => onUpdate(card.id, { model: card.model === m ? undefined : m })}
                        style={{
                          padding: '2px 10px', borderRadius: 10, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                          background: card.model === m ? theme.surface.selection : 'transparent',
                          color: card.model === m ? theme.accent.base : theme.text.disabled,
                          border: `1px solid ${card.model === m ? theme.border.accent : theme.border.subtle}`
                        }}
                      >{m.split('-').slice(-2).join('-')}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* Advanced section */}
              <div style={{ borderBottom: `1px solid ${theme.border.subtle}` }}>
                <button
                  onClick={() => setAdvanced(p => !p)}
                  style={{
                    width: '100%', padding: '8px 16px', background: 'none', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    color: theme.text.disabled, fontSize: 10, fontFamily: 'inherit', textAlign: 'left'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = theme.text.muted)}
                  onMouseLeave={e => (e.currentTarget.style.color = theme.text.disabled)}
                >
                  <span style={{ fontSize: 8 }}>{advanced ? 'v' : '>'}</span>
                  Advanced — MCP servers, hooks, config
                  {(card.mcpServers.length > 0 || card.hooks.length > 0) && (
                    <span style={{ marginLeft: 4, color: theme.accent.base }}>
                      {[card.mcpServers.length > 0 && `${card.mcpServers.length} MCP`, card.hooks.length > 0 && `${card.hooks.length} hooks`].filter(Boolean).join(', ')}
                    </span>
                  )}
                </button>

                {advanced && (
                  <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* MCP servers */}
                    <div>
                      <Label>MCP Servers</Label>
                      <div style={{ fontSize: 9, color: theme.status.success, marginBottom: 6, fontFamily: 'inherit' }}>
                        kanban (card_complete, card_update, card_error) always included
                      </div>
                      {card.mcpServers.map((s, i) => (
                        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                          <input value={s.name}
                            onChange={e => { const u = [...card.mcpServers]; u[i] = { ...s, name: e.target.value }; onUpdate(card.id, { mcpServers: u }) }}
                            placeholder="name" style={{ ...getInputStyle(theme), flex: '0 0 80px' }} />
                          <input value={s.url ?? s.cmd ?? ''}
                            onChange={e => {
                              const v = e.target.value; const u = [...card.mcpServers]
                              u[i] = v.startsWith('http') ? { ...s, url: v, cmd: undefined } : { ...s, cmd: v, url: undefined }
                              onUpdate(card.id, { mcpServers: u })
                            }}
                            placeholder="http://... or npx mcp-name"
                            style={{ ...getInputStyle(theme), flex: 1, fontFamily: fonts.mono, fontSize: 10, color: theme.status.success }} />
                          <Btn onClick={() => onUpdate(card.id, { mcpServers: card.mcpServers.filter((_, j) => j !== i) })} color={theme.status.danger}>x</Btn>
                        </div>
                      ))}
                      <AddBtn onClick={() => onUpdate(card.id, { mcpServers: [...card.mcpServers, { name: '', url: '' }] })}>
                        + MCP server
                      </AddBtn>
                    </div>

                    {/* Hooks */}
                    <div>
                      <Label>Hooks (before launch)</Label>
                      <ChipInput values={card.hooks} onChange={v => onUpdate(card.id, { hooks: v })}
                        prefix="$" placeholder="source .env, nvm use 20…" />
                    </div>

                    {/* MCP config override */}
                    <div>
                      <Label>MCP Config Path</Label>
                      <input value={card.mcpConfig ?? ''}
                        onChange={e => onUpdate(card.id, { mcpConfig: e.target.value || undefined })}
                        placeholder={MCP_CONFIG}
                        style={{ ...getInputStyle(theme), fontFamily: fonts.mono, color: theme.status.success, fontSize: 10 }} />
                    </div>

                    {/* Launch command preview */}
                    {card.agent !== 'shell' && launchCmd && (
                      <div>
                        <Label>Launch command</Label>
                        <div style={{
                          fontSize: 9, color: theme.accent.base, background: theme.surface.input,
                          border: `1px solid ${theme.border.subtle}`, borderRadius: 4, padding: '6px 10px',
                          fontFamily: fonts.mono, wordBreak: 'break-all', lineHeight: 1.6
                        }}>
                          <span style={{ color: theme.text.disabled }}>$ </span>{launchCmd}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Launch / status */}
              <div style={{ padding: '12px 16px' }}>
                {!card.launched ? (
                  <button onClick={() => onLaunch(card.id)} disabled={card.agent === 'shell'}
                    style={{
                      width: '100%', padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      background: card.agent === 'shell' ? theme.surface.panelMuted : theme.accent.base,
                      color: card.agent === 'shell' ? theme.text.disabled : theme.text.inverse,
                      border: 'none', cursor: card.agent === 'shell' ? 'default' : 'pointer', fontFamily: 'inherit',
                      letterSpacing: 0.3
                    }}
                    onMouseEnter={e => { if (card.agent !== 'shell') e.currentTarget.style.background = theme.accent.hover }}
                    onMouseLeave={e => { if (card.agent !== 'shell') e.currentTarget.style.background = theme.accent.base }}
                  >
                    {card.agent === 'shell' ? 'Select an agent to launch' : `Launch ${agentInfo?.label ?? card.agent}`}
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: active ? theme.status.success : theme.border.strong,
                      boxShadow: active ? `0 0 8px ${theme.status.success}` : 'none',
                      flexShrink: 0, transition: 'background 0.3s, box-shadow 0.3s'
                    }} />
                    <span style={{ fontSize: 12, color: active ? theme.status.success : theme.text.muted }}>
                      {active ? 'Agent active' : 'Agent idle'}
                    </span>
                    {card.briefPath && (
                      <span style={{ fontSize: 9, color: theme.text.disabled, fontFamily: fonts.mono, marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {card.briefPath.split('/').slice(-2).join('/')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Terminal tab ── */}
          {tab === 'terminal' && card.launched && (
            <div style={{ height: TERM_H }}>
              <MiniTerminal termId={termId} workspaceDir={workspaceDir} launchCmd={launchCmd} />
            </div>
          )}

          {/* ── Notes tab ── */}
          {tab === 'notes' && (
            <div style={{ background: theme.surface.panel, display: 'flex', flexDirection: 'column', height: 220 }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {card.comments.length === 0 && (
                  <div style={{ fontSize: 11, color: theme.text.disabled, textAlign: 'center', paddingTop: 16 }}>No notes</div>
                )}
                {card.comments.map(c => (
                  <div key={c.id} style={{ background: theme.surface.panelMuted, border: `1px solid ${theme.border.subtle}`, borderRadius: 5, padding: '6px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                      <span style={{ fontSize: 11, color: theme.text.secondary, flex: 1, lineHeight: 1.5 }}>{c.text}</span>
                      <Btn onClick={() => onUpdate(card.id, { comments: card.comments.filter(n => n.id !== c.id) })} color={theme.status.danger}>x</Btn>
                    </div>
                    <span style={{ fontSize: 9, color: theme.text.disabled }}>{new Date(c.ts).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '8px 10px', borderTop: `1px solid ${theme.border.subtle}`, display: 'flex', gap: 6 }}>
                <input value={newNote} onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addNote() }}
                  placeholder="Add a note…" style={{ ...getInputStyle(theme), flex: 1 }} />
                <button onClick={addNote} style={{ padding: '4px 12px', borderRadius: 5, background: theme.accent.base, color: theme.text.inverse, border: 'none', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>+</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Chip input ───────────────────────────────────────────────────────────────

interface ChipInputProps {
  values: string[]
  onChange: (v: string[]) => void
  prefix: string
  placeholder?: string
  sublabel?: string
  suggestions?: string[]
  suggestionMeta?: Record<string, string>   // name → description
  onDropFile?: (path: string) => void
}

function ChipInput({ values, onChange, prefix, placeholder, sublabel, suggestions = [], suggestionMeta = {}, onDropFile }: ChipInputProps): JSX.Element {
  const fonts = useAppFonts()
  const theme = useTheme()
  const [input, setInput] = useState('')
  const [showSugg, setShowSugg] = useState(false)
  const filtered = suggestions.filter(s => s.toLowerCase().includes(input.toLowerCase()) && !values.includes(s))

  const add = (val: string) => {
    const v = val.trim().replace(/^[@/$]/, '')
    if (!v || values.includes(v)) return
    onChange([...values, v])
    setInput(''); setShowSugg(false)
  }

  const prefixColor = prefix === '@' ? '#58a6ff' : prefix === '/' ? '#3fb950' : '#d7ba7d'
  const chipBg = prefix === '@' ? '#0d2137' : prefix === '/' ? '#0d2a1a' : '#1a1508'

  return (
    <div>
      {sublabel && <div style={{ fontSize: 9, color: theme.text.disabled, fontFamily: 'inherit', marginBottom: 4, letterSpacing: 0.5 }}>{sublabel}</div>}
      <div
        style={{ background: theme.surface.panelMuted, border: `1px solid ${theme.border.subtle}`, borderRadius: 6, padding: '5px 8px', position: 'relative', cursor: 'text' }}
        onDragOver={onDropFile ? e => e.preventDefault() : undefined}
        onDrop={onDropFile ? e => { e.preventDefault(); const p = e.dataTransfer.getData('text/plain'); if (p) onDropFile(p) } : undefined}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {values.map((v, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              background: chipBg, borderRadius: 4, padding: '2px 7px',
              fontSize: 10, color: prefixColor, fontFamily: fonts.mono,
              border: `1px solid ${prefixColor}22`
            }}>
              <span style={{ opacity: 0.4 }}>{prefix}</span>{v}
              <button onClick={() => onChange(values.filter((_, j) => j !== i))}
                style={{ fontSize: 9, color: 'inherit', opacity: 0.3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.3')}>x</button>
            </span>
          ))}
          <input value={input}
            onChange={e => { setInput(e.target.value); setShowSugg(true) }}
            onFocus={() => setShowSugg(true)}
            onBlur={() => setTimeout(() => setShowSugg(false), 150)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input) }
              if (e.key === 'Backspace' && !input && values.length) onChange(values.slice(0, -1))
              if (e.key === 'Escape') setShowSugg(false)
            }}
            placeholder={values.length === 0 ? `${prefix} ${placeholder}` : ''}
            style={{ background: 'none', border: 'none', outline: 'none', color: theme.text.secondary, fontSize: 11, fontFamily: fonts.mono, minWidth: 60, flex: 1, padding: '1px 0' }}
          />
        </div>
        {showSugg && filtered.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: theme.surface.panelElevated, border: `1px solid ${theme.border.default}`, borderRadius: 6, boxShadow: theme.shadow.panel, marginTop: 2, overflow: 'hidden' }}>
            {filtered.slice(0, 8).map(s => (
              <div key={s}
                style={{ padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 8 }}
                onMouseEnter={e => (e.currentTarget.style.background = theme.surface.hover)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onMouseDown={() => add(s)}
              >
                <span style={{ fontSize: 10, color: theme.text.secondary, fontFamily: fonts.mono, flexShrink: 0 }}>
                  <span style={{ color: prefixColor, opacity: 0.5 }}>{prefix}</span>{s}
                </span>
                {suggestionMeta[s] && (
                  <span style={{ fontSize: 9, color: theme.text.disabled, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {suggestionMeta[s]}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTitleInputStyle(theme: ReturnType<typeof useTheme>): React.CSSProperties {
  return {
    width: '100%', fontSize: 15, fontWeight: 700, padding: '4px 0', background: 'none',
    color: theme.text.primary, border: 'none', borderBottom: `1px solid ${theme.border.subtle}`,
    outline: 'none', fontFamily: 'inherit'
  }
}

function getTextareaStyle(theme: ReturnType<typeof useTheme>): React.CSSProperties {
  return {
    width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 5, resize: 'vertical',
    background: theme.surface.panelMuted, color: theme.text.secondary, border: `1px solid ${theme.border.subtle}`,
    outline: 'none', fontFamily: 'inherit', lineHeight: 1.6
  }
}

function getInputStyle(theme: ReturnType<typeof useTheme>): React.CSSProperties {
  return {
    width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 5,
    background: theme.surface.panelMuted, color: theme.text.secondary, border: `1px solid ${theme.border.subtle}`,
    outline: 'none', fontFamily: 'inherit'
  }
}

function Label({ children }: { children: React.ReactNode }): JSX.Element {
  const theme = useTheme()
  return <div style={{ fontSize: 10, color: theme.text.disabled, fontFamily: 'inherit', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }}>{children}</div>
}

function Chip({ label, prefix, bg, fg }: { label: string; prefix: string; bg: string; fg: string }): JSX.Element {
  return (
    <span style={{ fontSize: 9, background: bg, color: fg, borderRadius: 4, padding: '1px 6px', fontFamily: 'inherit', border: `1px solid ${fg}22` }}>
      <span style={{ opacity: 0.4 }}>{prefix}</span>{label}
    </span>
  )
}

function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }): JSX.Element {
  const theme = useTheme()
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick}
      style={{ width: '100%', fontSize: 10, color: h ? theme.accent.base : theme.text.disabled, background: 'none', border: `1px dashed ${h ? `${theme.accent.base}44` : theme.border.subtle}`, borderRadius: 5, padding: '4px 0', cursor: 'pointer', fontFamily: 'inherit', marginTop: 3, transition: 'color 0.1s' }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>
      {children}
    </button>
  )
}

function Btn({ onClick, color, children, title }: { onClick: () => void; color: string; children: React.ReactNode; title?: string }): JSX.Element {
  const theme = useTheme()
  const [h, setH] = useState(false)
  return (
    <button onClick={e => { e.stopPropagation(); onClick() }} title={title}
      style={{ fontSize: 10, color: h ? color : theme.text.disabled, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1, transition: 'color 0.1s', fontFamily: 'inherit' }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>
      {children}
    </button>
  )
}
