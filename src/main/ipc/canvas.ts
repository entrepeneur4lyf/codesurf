import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const COLLAB_DIR = join(homedir(), 'clawd-collab')

function assertSafeId(id: string): void {
  if (/[\/\\]|\.\./.test(id)) throw new Error(`Unsafe ID: ${id}`)
}

function canvasStatePath(workspaceId: string): string {
  assertSafeId(workspaceId)
  return join(COLLAB_DIR, 'workspaces', workspaceId, 'canvas-state.json')
}

function kanbanStatePath(workspaceId: string, tileId: string): string {
  assertSafeId(workspaceId)
  assertSafeId(tileId)
  return join(COLLAB_DIR, 'workspaces', workspaceId, `kanban-${tileId}.json`)
}

export function registerCanvasIPC(): void {
  ipcMain.handle('canvas:load', async (_, workspaceId: string) => {
    try {
      const raw = await fs.readFile(canvasStatePath(workspaceId), 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('canvas:save', async (_, workspaceId: string, state: unknown) => {
    const path = canvasStatePath(workspaceId)
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
    await fs.writeFile(path, JSON.stringify(state, null, 2))
  })
}
