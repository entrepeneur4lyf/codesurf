import React, { useState } from 'react'
import type { TileState } from '../../../shared/types'



const GAP = 40

interface Props {
  tiles: TileState[]
  onArrange: (updated: TileState[]) => void
  zoom: number
  onZoomToggle: () => void
  onEnterTabs: () => void
}

type Mode = 'grid' | 'column' | 'row'

// ─── Grid layout ────────────────────────────────────────────────────────────
function arrangeGrid(tiles: TileState[]): TileState[] {
  if (tiles.length === 0) return tiles

  const sorted = [...tiles].sort((a, b) => (b.height * b.width) - (a.height * a.width))
  const originX = Math.min(...tiles.map(t => t.x))
  const originY = Math.min(...tiles.map(t => t.y))
  const totalArea = tiles.reduce((sum, t) => sum + (t.width * t.height), 0)
  const targetRowWidth = Math.max(
    Math.max(...tiles.map(t => t.width)),
    Math.round(Math.sqrt(totalArea) * 1.35)
  )

  let cursorX = originX
  let cursorY = originY
  let rowHeight = 0

  const placed = new Map<string, TileState>()

  for (const tile of sorted) {
    const nextWidth = cursorX === originX ? tile.width : (cursorX - originX) + GAP + tile.width
    if (nextWidth > targetRowWidth && cursorX !== originX) {
      cursorX = originX
      cursorY += rowHeight + GAP
      rowHeight = 0
    }

    placed.set(tile.id, {
      ...tile,
      x: cursorX,
      y: cursorY,
    })

    cursorX += tile.width + GAP
    rowHeight = Math.max(rowHeight, tile.height)
  }

  return tiles.map(tile => placed.get(tile.id) ?? tile)
}

// ─── Column layout ──────────────────────────────────────────────────────────
function arrangeColumn(tiles: TileState[]): TileState[] {
  if (tiles.length === 0) return tiles
  const sorted = [...tiles].sort((a, b) => a.y - b.y)
  const originX = Math.min(...tiles.map(t => t.x))
  let cursor = Math.min(...tiles.map(t => t.y))
  return sorted.map(t => {
    const placed = { ...t, x: originX, y: cursor }
    cursor += t.height + GAP
    return placed
  })
}

// ─── Row layout ─────────────────────────────────────────────────────────────
function arrangeRow(tiles: TileState[]): TileState[] {
  if (tiles.length === 0) return tiles
  const sorted = [...tiles].sort((a, b) => a.x - b.x)
  const originY = Math.min(...tiles.map(t => t.y))
  let cursor = Math.min(...tiles.map(t => t.x))
  return sorted.map(t => {
    const placed = { ...t, x: cursor, y: originY }
    cursor += t.width + GAP
    return placed
  })
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
        width: 32, height: 32, borderRadius: 6,
        border: `1px solid ${active ? '#4a9eff55' : '#2d2d2d'}`,
        background: active ? 'rgba(74,158,255,0.12)' : 'rgba(30,30,30,0.9)',
        color: active ? '#4a9eff' : '#888',
        cursor: loading ? 'wait' : 'pointer',
        transition: 'all 0.1s',
        fontSize: 14,
        opacity: loading ? 0.5 : 1,
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(74,158,255,0.08)'
          e.currentTarget.style.color = '#aaa'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(30,30,30,0.9)'
          e.currentTarget.style.color = '#888'
        }
      }}
    >
      {label}
    </button>
  )
}

// ─── SVG icons ───────────────────────────────────────────────────────────────
const TabsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="5" width="14" height="10" rx="1"/>
    <rect x="1" y="2" width="4" height="4" rx="1"/>
    <rect x="6" y="2" width="4" height="4" rx="1"/>
  </svg>
)

const GridIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="1" width="6" height="6" rx="1"/>
    <rect x="9" y="1" width="6" height="6" rx="1"/>
    <rect x="1" y="9" width="6" height="6" rx="1"/>
    <rect x="9" y="9" width="6" height="6" rx="1"/>
  </svg>
)

const ColumnIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="2" y="1" width="12" height="4" rx="1"/>
    <rect x="2" y="6" width="12" height="4" rx="1"/>
    <rect x="2" y="11" width="12" height="4" rx="1"/>
  </svg>
)

const RowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="2" width="4" height="12" rx="1"/>
    <rect x="6" y="2" width="4" height="12" rx="1"/>
    <rect x="11" y="2" width="4" height="12" rx="1"/>
  </svg>
)

// ─── Toolbar ─────────────────────────────────────────────────────────────────
export function ArrangeToolbar({ tiles, onArrange, zoom, onZoomToggle, onEnterTabs }: Props): JSX.Element {
  const [loading, setLoading] = useState(false)
  const [lastMode, setLastMode] = useState<Mode | null>(null)

  const run = (mode: Mode) => {
    if (tiles.length < 2 || loading) return
    setLoading(true)
    setLastMode(mode)
    try {
      let updated: TileState[]
      if (mode === 'grid') updated = arrangeGrid(tiles)
      else if (mode === 'column') updated = arrangeColumn(tiles)
      else updated = arrangeRow(tiles)
      onArrange(updated)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        display: 'flex',
        gap: 4,
        padding: '4px 6px',
        background: 'rgba(20,20,20,0.92)',
        border: '1px solid #2d2d2d',
        borderRadius: 8,
        backdropFilter: 'blur(8px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        pointerEvents: 'all',
        zIndex: 1000,
        alignItems: 'center',
      }}
    >
      <Btn label={<TabsIcon />}   title="Tabbed view"              active={false}                loading={false}   onClick={onEnterTabs} />
      <div style={{ width: 1, height: 20, background: '#2d2d2d', margin: '0 2px' }} />
      <Btn label={<GridIcon />}   title="Grid layout (auto-wrap)"  active={lastMode === 'grid'}   loading={loading} onClick={() => run('grid')} />
      <Btn label={<ColumnIcon />} title="Stack in column"          active={lastMode === 'column'} loading={loading} onClick={() => run('column')} />
      <Btn label={<RowIcon />}    title="Arrange in row"           active={lastMode === 'row'}    loading={loading} onClick={() => run('row')} />
      <div style={{ width: 1, height: 20, background: '#2d2d2d', margin: '0 2px' }} />
      <button
        onClick={onZoomToggle}
        title="Toggle zoom to 100%"
        style={{
          fontSize: 11, color: zoom === 1 ? '#4a9eff' : '#888',
          background: 'transparent', border: 'none',
          cursor: 'pointer', padding: '4px 6px', borderRadius: 4,
          userSelect: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#ccc' }}
        onMouseLeave={e => { e.currentTarget.style.color = zoom === 1 ? '#4a9eff' : '#888' }}
      >
        {Math.round(zoom * 100)}%
      </button>
    </div>
  )
}
