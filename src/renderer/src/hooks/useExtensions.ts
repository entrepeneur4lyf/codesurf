/**
 * React hook to fetch extension tile types from the main process.
 * Refreshes on mount — extensions are loaded at startup and don't change dynamically (yet).
 */

import { useState, useEffect } from 'react'
import type { ExtensionTileContrib } from '../../../shared/types'

const el = (window as any).electron

export function useExtensions(workspacePath?: string | null) {
  const [extensionTiles, setExtensionTiles] = useState<ExtensionTileContrib[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        await el.extensions?.refresh?.(workspacePath ?? null)
        const tiles = await el.extensions?.listTiles?.()
        if (!cancelled && tiles) {
          setExtensionTiles(tiles)
        }
      } catch (err) {
        console.warn('[useExtensions] Failed to load extension tiles:', err)
      }
    }

    load()
    return () => { cancelled = true }
  }, [workspacePath])

  return { extensionTiles }
}
