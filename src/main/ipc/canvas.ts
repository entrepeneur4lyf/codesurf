import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { basename, dirname, join } from 'path'
import type { TileState } from '../../shared/types'
import { CONTEX_HOME } from '../paths'
import { findSessionEntryById, getExternalSessionChatState, invalidateExternalSessionCache, listExternalSessionEntries, type AggregatedSessionEntry } from '../session-sources'
import { getWorkspacePathById, getWorkspaceStorageIds } from './workspace'
import { isRelayHostActive } from '../relay/registration'
import { syncWorkspaceRelayParticipants } from '../relay/service'

function assertSafeId(id: string): void {
  if (/[\/\\]|\.\./.test(id)) throw new Error(`Unsafe ID: ${id}`)
}

/**
 * Migrate legacy flat files into .contex/ subfolder.
 * Runs once per storage dir — moves canvas-state, tile-state-*, kanban-* files.
 */
async function migrateStorageToContexDir(storageId: string): Promise<void> {
  assertSafeId(storageId)
  const wsDir = join(CONTEX_HOME, 'workspaces', storageId)
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
const migratedStorageIds = new Set<string>()

async function resolveStorageIds(workspaceId: string): Promise<string[]> {
  const ids = await getWorkspaceStorageIds(workspaceId)
  return Array.from(new Set(ids))
}

async function ensureWorkspaceStorageMigrated(workspaceId: string): Promise<string[]> {
  const storageIds = await resolveStorageIds(workspaceId)
  for (const storageId of storageIds) {
    if (migratedStorageIds.has(storageId)) continue
    migratedStorageIds.add(storageId)
    await migrateStorageToContexDir(storageId)
  }
  return storageIds
}

function canvasStatePath(storageId: string): string {
  assertSafeId(storageId)
  return join(CONTEX_HOME, 'workspaces', storageId, '.contex', 'canvas-state.json')
}

function kanbanStatePath(storageId: string, tileId: string): string {
  assertSafeId(storageId)
  assertSafeId(tileId)
  return join(CONTEX_HOME, 'workspaces', storageId, '.contex', `kanban-${tileId}.json`)
}

function tileStatePath(storageId: string, tileId: string): string {
  assertSafeId(storageId)
  assertSafeId(tileId)
  return join(CONTEX_HOME, 'workspaces', storageId, '.contex', `tile-state-${tileId}.json`)
}

async function deleteFileIfExists(path: string): Promise<void> {
  try {
    await fs.unlink(path)
  } catch {
    // ignore missing files
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

async function moveFileToDeleted(filePath: string): Promise<string> {
  const sourceDir = dirname(filePath)
  const deletedDir = join(sourceDir, 'deleted')
  await fs.mkdir(deletedDir, { recursive: true })

  const base = basename(filePath)
  let targetPath = join(deletedDir, base)
  if (await pathExists(targetPath)) {
    targetPath = join(deletedDir, `${Date.now()}-${base}`)
  }

  await fs.rename(filePath, targetPath)
  return targetPath
}

export function registerCanvasIPC(): void {
  ipcMain.handle('canvas:load', async (_, workspaceId: string) => {
    const storageIds = await ensureWorkspaceStorageMigrated(workspaceId)
    for (const storageId of storageIds) {
      try {
        const raw = await fs.readFile(canvasStatePath(storageId), 'utf8')
        return JSON.parse(raw)
      } catch {
        // try next alias storage dir
      }
    }
    return null
  })

  ipcMain.handle('canvas:save', async (_, workspaceId: string, state: unknown) => {
    const storageIds = await ensureWorkspaceStorageMigrated(workspaceId)
    const storageId = storageIds[0] ?? workspaceId
    const path = canvasStatePath(storageId)
    await fs.mkdir(join(CONTEX_HOME, 'workspaces', storageId, '.contex'), { recursive: true })
    await fs.writeFile(path, JSON.stringify(state, null, 2))

    if (isRelayHostActive() && state && typeof state === 'object' && Array.isArray((state as { tiles?: unknown }).tiles)) {
      const tiles = (state as { tiles: TileState[] }).tiles
      const wsPath = await getWorkspacePathById(workspaceId)
      if (wsPath) {
        void syncWorkspaceRelayParticipants(workspaceId, wsPath, tiles).catch(err => {
          console.warn('[Canvas] relay participant sync skipped:', err)
        })
      }
    }
  })

  ipcMain.handle('kanban:load', async (_, workspaceId: string, tileId: string) => {
    const storageIds = await ensureWorkspaceStorageMigrated(workspaceId)
    for (const storageId of storageIds) {
      try {
        const raw = await fs.readFile(kanbanStatePath(storageId, tileId), 'utf8')
        return JSON.parse(raw)
      } catch {
        // try next alias storage dir
      }
    }
    return null
  })

  ipcMain.handle('kanban:save', async (_, workspaceId: string, tileId: string, state: unknown) => {
    const storageIds = await ensureWorkspaceStorageMigrated(workspaceId)
    const storageId = storageIds[0] ?? workspaceId
    const path = kanbanStatePath(storageId, tileId)
    await fs.mkdir(join(CONTEX_HOME, 'workspaces', storageId, '.contex'), { recursive: true })
    await fs.writeFile(path, JSON.stringify(state, null, 2))
  })

  ipcMain.handle('canvas:loadTileState', async (_, workspaceId: string, tileId: string) => {
    const storageIds = await ensureWorkspaceStorageMigrated(workspaceId)
    for (const storageId of storageIds) {
      try {
        const raw = await fs.readFile(tileStatePath(storageId, tileId), 'utf8')
        return JSON.parse(raw)
      } catch {
        // try next alias storage dir
      }
    }
    return null
  })

  ipcMain.handle('canvas:saveTileState', async (_, workspaceId: string, tileId: string, state: unknown) => {
    const storageIds = await ensureWorkspaceStorageMigrated(workspaceId)
    const storageId = storageIds[0] ?? workspaceId
    const path = tileStatePath(storageId, tileId)
    await fs.mkdir(join(CONTEX_HOME, 'workspaces', storageId, '.contex'), { recursive: true })
    await fs.writeFile(path, JSON.stringify(state, null, 2))
  })

  ipcMain.handle('canvas:clearTileState', async (_, workspaceId: string, tileId: string) => {
    const storageIds = await ensureWorkspaceStorageMigrated(workspaceId)
    await Promise.all(storageIds.map(storageId => deleteFileIfExists(tileStatePath(storageId, tileId))))
  })

  // List all chat sessions for a workspace by combining local CodeSurf tile sessions with
  // project/user .codesurf sessions and external provider session stores.
  ipcMain.handle('canvas:listSessions', async (_, workspaceId: string) => {
    assertSafeId(workspaceId)
    const storageIds = await ensureWorkspaceStorageMigrated(workspaceId)
    const workspacePath = await getWorkspacePathById(workspaceId)
    const sessions: AggregatedSessionEntry[] = []

    for (const storageId of storageIds) {
      const dotDir = join(CONTEX_HOME, 'workspaces', storageId, '.contex')
      try {
        const entries = await fs.readdir(dotDir)
        const tileStateFiles = entries.filter(name => name.startsWith('tile-state-') && name.endsWith('.json'))

        for (const file of tileStateFiles) {
          try {
            const filePath = join(dotDir, file)
            const raw = await fs.readFile(filePath, 'utf8')
            const state = JSON.parse(raw)
            if (!Array.isArray(state.messages) || state.messages.length === 0) continue
            const stat = await fs.stat(filePath)
            const lastMsg = state.messages[state.messages.length - 1]
            sessions.push({
              id: `codesurf-tile:${file}`,
              source: 'codesurf',
              scope: 'workspace',
              tileId: file.replace('tile-state-', '').replace('.json', ''),
              sessionId: state.sessionId ?? null,
              provider: state.provider ?? 'claude',
              model: state.model ?? '',
              messageCount: state.messages.length,
              lastMessage: typeof lastMsg?.content === 'string' ? lastMsg.content.slice(0, 120) : null,
              updatedAt: stat.mtimeMs,
              title: typeof lastMsg?.content === 'string' && lastMsg.content.trim()
                ? lastMsg.content.slice(0, 80)
                : `${state.provider ?? 'codesurf'} session`,
              filePath,
              projectPath: workspacePath,
              sourceLabel: 'CodeSurf',
              sourceDetail: state.provider ? `${state.provider}` : 'Workspace chat',
              canOpenInChat: true,
              canOpenInApp: false,
              nestingLevel: 0,
            })
          } catch {
            // skip corrupt files
          }
        }
      } catch {
        // skip missing alias storage dirs
      }
    }

    sessions.push(...await listExternalSessionEntries(workspacePath))
    sessions.sort((a, b) => b.updatedAt - a.updatedAt)
    return sessions
  })

  ipcMain.handle('canvas:getSessionState', async (_, workspaceId: string, sessionEntryId: string) => {
    const workspacePath = await getWorkspacePathById(workspaceId)

    if (sessionEntryId.startsWith('codesurf-tile:')) {
      const tileId = sessionEntryId.replace('codesurf-tile:tile-state-', '').replace('.json', '')
      const storageIds = await ensureWorkspaceStorageMigrated(workspaceId)
      for (const storageId of storageIds) {
        try {
          const raw = await fs.readFile(tileStatePath(storageId, tileId), 'utf8')
          return JSON.parse(raw)
        } catch {
          // try next alias storage dir
        }
      }
      return null
    }

    return getExternalSessionChatState(workspacePath, sessionEntryId)
  })

  ipcMain.handle('canvas:deleteSession', async (_, workspaceId: string, sessionEntryId: string) => {
    assertSafeId(workspaceId)
    const workspacePath = await getWorkspacePathById(workspaceId)

    if (sessionEntryId.startsWith('codesurf-tile:')) {
      const tileId = sessionEntryId.replace('codesurf-tile:tile-state-', '').replace('.json', '')
      const storageIds = await ensureWorkspaceStorageMigrated(workspaceId)
      for (const storageId of storageIds) {
        const filePath = tileStatePath(storageId, tileId)
        if (!(await pathExists(filePath))) continue
        await moveFileToDeleted(filePath)
      }
      return { ok: true }
    }

    const entry = await findSessionEntryById(workspacePath, sessionEntryId)
    if (!entry?.filePath) return { ok: false, error: 'Session file not found' }
    if (!(await pathExists(entry.filePath))) return { ok: false, error: 'Session file missing' }

    const deletedPath = await moveFileToDeleted(entry.filePath)

    if (entry.source === 'openclaw') {
      const [, agentId, ...keyParts] = sessionEntryId.split(':')
      const sessionKey = keyParts.join(':')
      const indexPath = join(process.env.HOME || '', '.openclaw', 'agents', agentId, 'sessions', 'sessions.json')
      if (agentId && sessionKey && await pathExists(indexPath)) {
        try {
          const raw = await fs.readFile(indexPath, 'utf8')
          const parsed = JSON.parse(raw) as Record<string, any>
          if (parsed[sessionKey] && typeof parsed[sessionKey] === 'object') {
            parsed[sessionKey] = {
              ...parsed[sessionKey],
              deletedAt: Date.now(),
              deletedFile: deletedPath,
              sessionFile: deletedPath,
            }
            await fs.writeFile(indexPath, JSON.stringify(parsed, null, 2))
          }
        } catch {
          // ignore index update failures; file move already succeeded
        }
      }
    }

    invalidateExternalSessionCache(workspacePath)
    return { ok: true }
  })

  ipcMain.handle('canvas:deleteTileArtifacts', async (_, workspaceId: string, tileId: string) => {
    const storageIds = await ensureWorkspaceStorageMigrated(workspaceId)
    await Promise.all(storageIds.flatMap(storageId => [
      deleteFileIfExists(tileStatePath(storageId, tileId)),
      deleteFileIfExists(kanbanStatePath(storageId, tileId)),
    ]))
  })
}
