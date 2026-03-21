import { homedir } from 'os'
import { join } from 'path'

export const APP_NAME = 'Contex'
export const APP_ID = 'com.huggiapps.contex'
export const CONTEX_HOME_DIRNAME = '.contex'
export const LEGACY_HOME_DIRNAME = 'clawd-collab'
export const TILE_CONTEXT_DIRNAME = '.contex'
export const LEGACY_TILE_CONTEXT_DIRNAME = '.collab'

export const CONTEX_HOME = join(homedir(), CONTEX_HOME_DIRNAME)
export const LEGACY_HOME = join(homedir(), LEGACY_HOME_DIRNAME)
export const WORKSPACES_DIR = join(CONTEX_HOME, 'workspaces')

export function workspaceTileDir(workspacePath: string, tileId: string): string {
  return join(workspacePath, TILE_CONTEXT_DIRNAME, tileId)
}

export function legacyWorkspaceTileDir(workspacePath: string, tileId: string): string {
  return join(workspacePath, LEGACY_TILE_CONTEXT_DIRNAME, tileId)
}

export function workspaceTileContextDir(workspacePath: string, tileId: string): string {
  return join(workspaceTileDir(workspacePath, tileId), 'context')
}

export function legacyWorkspaceTileContextDir(workspacePath: string, tileId: string): string {
  return join(legacyWorkspaceTileDir(workspacePath, tileId), 'context')
}
