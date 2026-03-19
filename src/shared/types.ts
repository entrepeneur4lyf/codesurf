export interface Workspace {
  id: string
  name: string
  path: string
}

export type TileType = 'terminal' | 'note' | 'code' | 'image' | 'kanban' | 'browser'

export interface AppSettings {
  // Canvas
  canvasBackground: string
  gridColorSmall: string
  gridColorLarge: string
  gridSpacingSmall: number
  gridSpacingLarge: number
  snapToGrid: boolean
  gridSize: number
  // Terminal
  terminalFontSize: number
  terminalFontFamily: string
  // Appearance
  uiFontSize: number
  // Sidebar
  sidebarDefaultSort: 'name' | 'type' | 'ext'
  sidebarIgnored: string[]
  // Behaviour
  autoSaveIntervalMs: number
  defaultTileSizes: Record<TileType, { w: number; h: number }>
}

export const DEFAULT_SETTINGS: AppSettings = {
  canvasBackground: '#1e1e1e',
  gridColorSmall: '#333333',
  gridColorLarge: '#4a4a4a',
  gridSpacingSmall: 20,
  gridSpacingLarge: 100,
  snapToGrid: true,
  gridSize: 20,
  terminalFontSize: 13,
  terminalFontFamily: '"JetBrains Mono", "Menlo", "Monaco", "SF Mono", monospace',
  uiFontSize: 12,
  sidebarDefaultSort: 'name',
  sidebarIgnored: ['.git', 'node_modules', '.next', 'dist', 'dist-electron', '.DS_Store', '__pycache__', '.cache', 'out'],
  autoSaveIntervalMs: 500,
  defaultTileSizes: {
    terminal: { w: 600, h: 400 },
    code:     { w: 680, h: 500 },
    note:     { w: 500, h: 400 },
    image:    { w: 440, h: 360 },
    kanban:   { w: 900, h: 560 },
    browser:  { w: 1000, h: 700 },
  }
}

export function withDefaultSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const settings = input ?? {}
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    sidebarIgnored: settings.sidebarIgnored ?? DEFAULT_SETTINGS.sidebarIgnored,
    defaultTileSizes: {
      ...DEFAULT_SETTINGS.defaultTileSizes,
      ...(settings.defaultTileSizes ?? {})
    }
  } as AppSettings
}

export interface Config {
  workspaces: Workspace[]
  activeWorkspaceIndex: number
  settings: AppSettings
}

export interface TileState {
  id: string
  type: TileType
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  filePath?: string
  groupId?: string
}

export interface GroupState {
  id: string
  label?: string
  color?: string
  parentGroupId?: string
}

export interface CanvasState {
  tiles: TileState[]
  groups: GroupState[]
  viewport: { tx: number; ty: number; zoom: number }
  nextZIndex: number
}
