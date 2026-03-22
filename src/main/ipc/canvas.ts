import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { CONTEX_HOME } from '../paths'

function assertSafeId(id: string): void {
  if (/[\/\\]|\.\./.test(id)) throw new Error(`Unsafe ID: ${id}`)
}

/**
 * Migrate legacy flat files into .contex/ subfolder.
 * Runs once per workspace on first canvas load — moves canvas-state, tile-state-*, kanban-* files.
 */
async function migrateToContexDir(workspaceId: string): Promise<void> {
  assertSafeId(workspaceId)
  const wsDir = join(CONTEX_HOME, 'workspaces', workspaceId)
  const dotDir = join(wsDir, '.contex')
  try { await fs.mkdir(dotDir, { recursive: true }) } catch {}
  try {
    const entries = await fs.readdir(wsDir)
    const migratable = entries.filter(name =>
      name === 'canvas-state.json' ||
      name === 'activity.json' ||
      name === 'mcp-merged.json' ||
      name.startsWith('tile-state-') ||
      name.startsWith('kanban-')
    )
    for (const name of migratable) {
      const src = join(wsDir, name)
      const dest = join(dotDir, name)
      try {
        await fs.access(dest) // already migrated
      } catch {
        await fs.rename(src, dest)
      }
    }
  } catch {} // workspace dir may not exist yet
}
const migratedWorkspaces = new Set<string>()

function canvasStatePath(workspaceId: string): string {
  assertSafeId(workspaceId)
  return join(CONTEX_HOME, 'workspaces', workspaceId, '.contex', 'canvas-state.json')
}

function kanbanStatePath(workspaceId: string, tileId: string): string {
  assertSafeId(workspaceId)
  assertSafeId(tileId)
  return join(CONTEX_HOME, 'workspaces', workspaceId, '.contex', `kanban-${tileId}.json`)
}

function tileStatePath(workspaceId: string, tileId: string): string {
  assertSafeId(workspaceId)
  assertSafeId(tileId)
  return join(CONTEX_HOME, 'workspaces', workspaceId, '.contex', `tile-state-${tileId}.json`)
}

async function deleteFileIfExists(path: string): Promise<void> {
  try {
    await fs.unlink(path)
  } catch {
    // ignore missing files
  }
}

export function registerCanvasIPC(): void {
  ipcMain.handle('canvas:load', async (_, workspaceId: string) => {
    // Migrate legacy flat files into .contex/ on first access
    if (!migratedWorkspaces.has(workspaceId)) {
      migratedWorkspaces.add(workspaceId)
      await migrateToContexDir(workspaceId)
    }
    try {
      const raw = await fs.readFile(canvasStatePath(workspaceId), 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('canvas:save', async (_, workspaceId: string, state: unknown) => {
    const path = canvasStatePath(workspaceId)
    await fs.mkdir(join(CONTEX_HOME, 'workspaces', workspaceId, '.contex'), { recursive: true })
    await fs.writeFile(path, JSON.stringify(state, null, 2))
  })

  ipcMain.handle('kanban:load', async (_, workspaceId: string, tileId: string) => {
    try {
      const raw = await fs.readFile(kanbanStatePath(workspaceId, tileId), 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('kanban:save', async (_, workspaceId: string, tileId: string, state: unknown) => {
    const path = kanbanStatePath(workspaceId, tileId)
    await fs.mkdir(join(CONTEX_HOME, 'workspaces', workspaceId, '.contex'), { recursive: true })
    await fs.writeFile(path, JSON.stringify(state, null, 2))
  })

  ipcMain.handle('canvas:loadTileState', async (_, workspaceId: string, tileId: string) => {
    try {
      const raw = await fs.readFile(tileStatePath(workspaceId, tileId), 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('canvas:saveTileState', async (_, workspaceId: string, tileId: string, state: unknown) => {
    const path = tileStatePath(workspaceId, tileId)
    await fs.mkdir(join(CONTEX_HOME, 'workspaces', workspaceId, '.contex'), { recursive: true })
    await fs.writeFile(path, JSON.stringify(state, null, 2))
  })

  ipcMain.handle('canvas:clearTileState', async (_, workspaceId: string, tileId: string) => {
    await deleteFileIfExists(tileStatePath(workspaceId, tileId))
  })

  ipcMain.handle('canvas:deleteTileArtifacts', async (_, workspaceId: string, tileId: string) => {
    await Promise.all([
      deleteFileIfExists(tileStatePath(workspaceId, tileId)),
      deleteFileIfExists(kanbanStatePath(workspaceId, tileId)),
    ])
  })
}
