import { promises as fs } from 'fs'
import { join } from 'path'
import {
  APP_NAME,
  CONTEX_HOME,
  LEGACY_HOME,
  LEGACY_TILE_CONTEXT_DIRNAME,
  TILE_CONTEXT_DIRNAME,
  WORKSPACES_DIR,
} from './paths'

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

async function migrateHomeDirectory(): Promise<void> {
  if (await exists(CONTEX_HOME) || !(await exists(LEGACY_HOME))) return
  await fs.rename(LEGACY_HOME, CONTEX_HOME)
  console.log(`[Migration] Renamed ${LEGACY_HOME} -> ${CONTEX_HOME}`)
}

async function migrateWorkspaceTileDirs(): Promise<void> {
  if (!(await exists(WORKSPACES_DIR))) return

  const workspaceIds = await fs.readdir(WORKSPACES_DIR)
  for (const workspaceId of workspaceIds) {
    const workspacePath = join(WORKSPACES_DIR, workspaceId)
    const legacyDir = join(workspacePath, LEGACY_TILE_CONTEXT_DIRNAME)
    const newDir = join(workspacePath, TILE_CONTEXT_DIRNAME)

    if (!(await exists(legacyDir)) || await exists(newDir)) continue

    await fs.rename(legacyDir, newDir)
    console.log(`[Migration] Renamed ${legacyDir} -> ${newDir}`)
  }
}

export async function migrateLegacyStorage(): Promise<void> {
  try {
    await migrateHomeDirectory()
    await fs.mkdir(CONTEX_HOME, { recursive: true })
    await migrateWorkspaceTileDirs()
  } catch (error) {
    console.error(`[Migration] ${APP_NAME} storage migration failed:`, error)
    throw error
  }
}
