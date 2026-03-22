import React, { useState } from 'react'
import { Settings } from 'lucide-react'
import type { TileState, GroupState } from '../../../shared/types'

const GAP = 50
const GROUP_PAD = 20
const SLIDEOUT_RESERVE_WIDTH = 272

type Mode = 'grid' | 'column' | 'row'

interface Props {
  tiles: TileState[]
  groups: GroupState[]
  onArrange: (updated: TileState[], mode: Mode) => void
  zoom: number
  onZoomToggle: () => void
  onToggleTabs: () => void
  onOpenSettings: () => void
  isTabbedView?: boolean
  activeCanvasMode?: Mode | null
}

function getArrangeWidth(tile: TileState): number {
  const reserve = tile.type === 'terminal' || tile.type === 'chat' ? SLIDEOUT_RESERVE_WIDTH : 0
  return tile.width + reserve
}

// ─── Pure-math layouts ───────────────────────────────────────────────────────

function arrangeTiles(
  tiles: TileState[],
  _groups: GroupState[],
  mode: Mode
): TileState[] {
  if (tiles.length === 0) return tiles

  if (mode === 'column') {
    let y = 0
    return tiles.map(t => {
      const out = { ...t, x: 0, y }
      y += t.height + GAP
      return out
    })
  }

  if (mode === 'row') {
    let x = 0
    return tiles.map(t => {
      const w = getArrangeWidth(t)
      const out = { ...t, x, y: 0 }
      x += w + GAP
      return out
    })
  }

  // Grid: keep each tile's natural size, pack into rows
  const cols = Math.max(1, Math.round(Math.sqrt(tiles.length * 1.6)))
  // Use a uniform column width so tiles align, but keep individual heights
  const colW = Math.max(...tiles.map(t => t.width))

  const result: TileState[] = []
  let y = 0
  for (let row = 0; row * cols < tiles.length; row++) {
    const rowTiles = tiles.slice(row * cols, (row + 1) * cols)
    const rowH = Math.max(...rowTiles.map(t => t.height))
    for (let col = 0; col < rowTiles.length; col++) {
      result.push({
        ...rowTiles[col],
        x: col * (colW + GAP),
        y,
      })
    }
    y += rowH + GAP
  }
  return result
}

// ─── Button ──────────────────────────────────────────────────────────────────
function Btn({ label, title, active, loading, onClick }: {
  label: React.ReactNode
  title: string
  active: boolean
  loading: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 23, height: 23, borderRadius: 7,
        border: `1px solid ${active ? 'rgba(90,170,255,0.42)' : '#2d2d2d'}`,
        // @ts-ignore
        WebkitAppRegion: 'no-drag',
        background: active
          ? 'linear-gradient(180deg, rgba(74,158,255,0.20) 0%, rgba(74,158,255,0.10) 100%)'
          : 'rgba(30,30,30,0.9)',
        color: active ? '#edf6ff' : '#a3abb6',
        cursor: loading ? 'wait' : 'pointer',
        transition: 'all 0.12s ease',
        fontSize: 12,
        opacity: loading ? 0.5 : 1,
        boxShadow: active
          ? 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 24px rgba(24,84,160,0.28), 0 0 0 1px rgba(74,158,255,0.08)'
          : 'none',
        backdropFilter: active ? 'blur(14px)' : 'none',
        WebkitBackdropFilter: active ? 'blur(14px)' : 'none',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(74,158,255,0.08)'
          e.currentTarget.style.color = '#c2cad4'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(30,30,30,0.9)'
          e.currentTarget.style.color = '#a3abb6'
        }
      }}
    >
      {label}
    </button>
  )
}

// ─── SVG icons ───────────────────────────────────────────────────────────────
const TabsIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="5" width="14" height="10" rx="1"/>
    <rect x="1" y="2" width="4" height="4" rx="1"/>
    <rect x="6" y="2" width="4" height="4" rx="1"/>
  </svg>
)

const GridIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="1" width="6" height="6" rx="1"/>
    <rect x="9" y="1" width="6" height="6" rx="1"/>
    <rect x="1" y="9" width="6" height="6" rx="1"/>
    <rect x="9" y="9" width="6" height="6" rx="1"/>
  </svg>
)

const ColumnIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <rect x="2" y="1" width="12" height="4" rx="1"/>
    <rect x="2" y="6" width="12" height="4" rx="1"/>
    <rect x="2" y="11" width="12" height="4" rx="1"/>
  </svg>
)

const RowIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="2" width="4" height="12" rx="1"/>
    <rect x="6" y="2" width="4" height="12" rx="1"/>
    <rect x="11" y="2" width="4" height="12" rx="1"/>
  </svg>
)

// ─── Toolbar ─────────────────────────────────────────────────────────────────
export function ArrangeToolbar({ tiles, groups, onArrange, zoom, onZoomToggle, onToggleTabs, onOpenSettings, isTabbedView = false, activeCanvasMode = null }: Props): JSX.Element {
  const [loading, setLoading] = useState(false)

  const run = async (mode: Mode) => {
    if (tiles.length < 2 || loading) return
    setLoading(true)
    try {
      const updated = arrangeTiles(tiles, groups, mode)
      onArrange(updated, mode)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 6,
        right: 16,
        display: 'flex',
        gap: 6,
        pointerEvents: 'all',
        zIndex: 1000,
        alignItems: 'center',
        // @ts-ignore
        WebkitAppRegion: 'no-drag',
      }}
    >
      <button
        onClick={onOpenSettings}
        title="Settings"
        style={{
          width: 29,
          height: 29,
          borderRadius: 9,
          background: 'rgba(20,20,20,0.92)',
          // @ts-ignore
          WebkitAppRegion: 'no-drag',
          border: '1px solid #2d2d2d',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#a3abb6',
          transition: 'all 0.12s ease',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(74,158,255,0.08)'
          e.currentTarget.style.color = '#e1e6ec'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(20,20,20,0.92)'
          e.currentTarget.style.color = '#a3abb6'
          e.currentTarget.style.borderColor = '#2d2d2d'
        }}
      >
        <Settings size={14} />
      </button>

      <div
        style={{
          display: 'flex',
          gap: 4,
          height: 29,
          padding: '2px 6px',
          background: 'rgba(20,20,20,0.92)',
          // @ts-ignore
          WebkitAppRegion: 'no-drag',
          border: '1px solid #2d2d2d',
          borderRadius: 9,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          alignItems: 'center',
        }}
      >
        <Btn label={<TabsIcon />}   title="Tabbed view"              active={isTabbedView}                              loading={false}   onClick={onToggleTabs} />
        <div style={{ width: 1, height: 14, background: '#2d2d2d', margin: '0 1px' }} />
        <Btn label={<GridIcon />}   title="Grid layout (ELK)"        active={!isTabbedView && activeCanvasMode === 'grid'}   loading={loading} onClick={() => run('grid')} />
        <Btn label={<ColumnIcon />} title="Stack in column (ELK)"    active={!isTabbedView && activeCanvasMode === 'column'} loading={loading} onClick={() => run('column')} />
        <Btn label={<RowIcon />}    title="Arrange in row (ELK)"     active={!isTabbedView && activeCanvasMode === 'row'}    loading={loading} onClick={() => run('row')} />
        <div style={{ width: 1, height: 14, background: '#2d2d2d', margin: '0 1px' }} />
        <button
          onClick={onZoomToggle}
          title="Toggle zoom to 100%"
          style={{
            fontSize: 10,
            color: zoom === 1 ? '#69afff' : '#a3abb6',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            // @ts-ignore
            WebkitAppRegion: 'no-drag',
            border: 'none',
            cursor: 'pointer',
            padding: '0 5px',
            borderRadius: 4,
            userSelect: 'none',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e1e6ec' }}
          onMouseLeave={e => { e.currentTarget.style.color = zoom === 1 ? '#69afff' : '#a3abb6' }}
        >
          {Math.round(zoom * 100)}%
        </button>
      </div>
    </div>
  )
}
