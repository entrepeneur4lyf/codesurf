import React, { useEffect, useRef, useState, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { useAppFonts } from '../FontContext'
import { useTheme } from '../ThemeContext'

interface Props {
  filePath?: string
  initialContent?: string
}

// Minimal markdown → HTML renderer (no deps)
function renderMarkdown(md: string): string {
  let html = md
    // Escape HTML
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // Horizontal rule
    .replace(/^---+$/gm, '<hr/>')
    // Unordered lists
    .replace(/^\s*[-*+] (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\s*\d+\. (.+)$/gm, '<li>$1</li>')
    // Code blocks (fenced)
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Paragraphs (double newline)
    .replace(/\n\n([^<])/g, '\n\n<p>$1')
    // Line breaks
    .replace(/\n/g, '<br/>')

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>)(\s*<br\/>)*/g, (m) => `<ul>${m.replace(/<br\/>/g, '')}</ul>`)

  return html
}

export function NoteTile({ filePath, initialContent = '' }: Props): JSX.Element {
  const [content, setContent] = useState<string | undefined>(undefined)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loaded = useRef(false)
  const fonts = useAppFonts()
  const theme = useTheme()

  useEffect(() => {
    loaded.current = false
    if (!filePath) {
      setContent(initialContent || '# Untitled\n\nStart writing…')
      loaded.current = true
      return
    }
    window.electron.fs.readFile(filePath).then(text => {
      setContent(text)
      loaded.current = true
    }).catch(() => {
      setContent('')
      loaded.current = true
    })
  }, [filePath, initialContent])

  const handleChange = useCallback((value: string | undefined) => {
    if (!loaded.current || value === undefined) return
    setContent(value)
    if (!filePath) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.electron.fs.writeFile(filePath, value)
    }, 500)
  }, [filePath])

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: theme.editor.background, position: 'relative' }}>
      {/* Mode toggle icons — float top-right over content */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 2 }}>
        <button
          onClick={() => setMode('edit')}
          title="Edit"
          style={{
            width: 24, height: 24, borderRadius: 4, border: 'none', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: mode === 'edit' ? theme.accent.soft : theme.surface.panelMuted,
            color: mode === 'edit' ? theme.accent.base : theme.text.disabled,
          }}
          onMouseEnter={e => { if (mode !== 'edit') { e.currentTarget.style.background = theme.surface.hover; e.currentTarget.style.color = theme.text.muted } }}
          onMouseLeave={e => { if (mode !== 'edit') { e.currentTarget.style.background = theme.surface.panelMuted; e.currentTarget.style.color = theme.text.disabled } }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M9 1.5L11.5 4L4.5 11H2V8.5L9 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          onClick={() => setMode('preview')}
          title="Preview"
          style={{
            width: 24, height: 24, borderRadius: 4, border: 'none', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: mode === 'preview' ? theme.accent.soft : theme.surface.panelMuted,
            color: mode === 'preview' ? theme.accent.base : theme.text.disabled,
          }}
          onMouseEnter={e => { if (mode !== 'preview') { e.currentTarget.style.background = theme.surface.hover; e.currentTarget.style.color = theme.text.muted } }}
          onMouseLeave={e => { if (mode !== 'preview') { e.currentTarget.style.background = theme.surface.panelMuted; e.currentTarget.style.color = theme.text.disabled } }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 7C1 7 3 3 7 3C11 3 13 7 13 7C13 7 11 11 7 11C3 11 1 7 1 7Z" stroke="currentColor" strokeWidth="1.3"/>
            <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {mode === 'edit' ? (
          <Editor
            height="100%"
            language="markdown"
            value={content}
            onChange={handleChange}
            theme={theme.editor.monacoBase}
            loading={<div style={{ height: '100%', background: theme.editor.background }} />}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: 1.7,
              wordWrap: 'on',
              automaticLayout: true,
              padding: { top: 12 },
              scrollBeyondLastLine: false,
              fontFamily: fonts.mono,
              lineNumbers: 'off',
              folding: false,
              renderLineHighlight: 'none',
              overviewRulerBorder: false,
              scrollbar: { verticalScrollbarSize: 4 }
            }}
          />
        ) : (
          <div
            className="note-preview"
            style={{ height: '100%', overflowY: 'auto', padding: '16px 20px' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content ?? '') }}
          />
        )}
      </div>

      {/* Preview styles injected inline */}
      <style>{`
        .note-preview h1 { font-size: 1.6em; font-weight: 700; color: ${theme.text.primary}; margin: 0 0 12px; }
        .note-preview h2 { font-size: 1.3em; font-weight: 600; color: ${theme.text.secondary}; margin: 16px 0 8px; }
        .note-preview h3 { font-size: 1.1em; font-weight: 600; color: ${theme.text.secondary}; margin: 12px 0 6px; }
        .note-preview p  { color: ${theme.text.secondary}; line-height: 1.7; margin: 0 0 10px; }
        .note-preview code { background: ${theme.surface.panelMuted}; color: ${theme.accent.base}; padding: 1px 5px; border-radius: 3px; font-size: 12px; font-family: "JetBrains Mono", monospace; }
        .note-preview pre { background: ${theme.surface.panelMuted}; border: 1px solid ${theme.border.default}; border-radius: 4px; padding: 12px; overflow-x: auto; margin: 10px 0; }
        .note-preview pre code { background: none; padding: 0; }
        .note-preview ul, .note-preview ol { color: ${theme.text.secondary}; padding-left: 20px; margin: 6px 0; }
        .note-preview li { line-height: 1.7; }
        .note-preview a { color: ${theme.accent.base}; text-decoration: none; }
        .note-preview a:hover { text-decoration: underline; }
        .note-preview blockquote { border-left: 3px solid ${theme.border.strong}; padding-left: 12px; color: ${theme.text.muted}; margin: 8px 0; }
        .note-preview hr { border: none; border-top: 1px solid ${theme.border.default}; margin: 16px 0; }
        .note-preview strong { color: ${theme.text.primary}; }
      `}</style>
    </div>
  )
}
