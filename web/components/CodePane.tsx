'use client'

import Editor, { loader, type Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useEffect, useRef } from 'react'

// Load Monaco from public/ instead of the default CDN: a static export should
// not need the network to show an editor. scripts/sync-fixtures.mjs puts it there.
loader.config({ paths: { vs: '/monaco/vs' } })

// Monaco takes hex, not CSS variables, so the palette is repeated here.
// Names match the tokens in globals.css.
const THEME: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'c8ccd8' }, // --text-code
    { token: 'keyword', foreground: 'a78bfa' }, // --syn-keyword
    { token: 'number', foreground: 'f0a868' }, // --syn-number
    { token: 'string', foreground: '8fd694' }, // --syn-string
    { token: 'string.escape', foreground: '8fd694' },
    { token: 'comment', foreground: '6a6f7f', fontStyle: 'italic' }, // --text-dim
    { token: 'operator', foreground: '8b90a0' }, // --syn-operator
    { token: 'delimiter', foreground: '8b90a0' },
    { token: 'identifier', foreground: 'c8ccd8' },
    { token: 'type', foreground: '7dd3fc' }, // --syn-fn
    { token: 'function', foreground: '7dd3fc' },
  ],
  colors: {
    'editor.background': '#0f1116', // --bg-panel
    'editor.foreground': '#c8ccd8',
    'editorLineNumber.foreground': '#484d5c', // --text-gutter
    'editorLineNumber.activeForeground': '#f9a8d4', // --exec-text
    'editorGutter.background': '#0f1116',
    'editor.lineHighlightBackground': '#00000000',
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#f472b6', // --exec
    'editor.selectionBackground': '#262935', // --border-strong
    'editorIndentGuide.background1': '#1c1e26', // --border
    'editorIndentGuide.activeBackground1': '#262935',
    'editorWidget.background': '#101218', // --bg-chrome
    'editorWidget.border': '#1c1e26',
    'scrollbarSlider.background': '#26293580',
    'scrollbarSlider.hoverBackground': '#262935',
    'scrollbarSlider.activeBackground': '#333746',
  },
}

type CodePaneProps = {
  source: string
  line: number
  onChange: (source: string) => void
  onRun: () => void
}

export function CodePane({ source, line, onChange, onRun }: CodePaneProps) {
  const runRef = useRef(onRun)
  runRef.current = onRun

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)

  useEffect(() => {
    const monaco = monacoRef.current
    const instance = editorRef.current
    const decorations = decorationsRef.current
    if (!monaco || !instance || !decorations) return

    // Step 0 is the module's `call` event, which reports line 0 — there is no
    // such line to point at, so highlight nothing.
    if (line < 1) {
      decorations.clear()
      return
    }

    decorations.set([
      {
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: 'exec-line',
          glyphMarginClassName: 'exec-glyph',
        },
      },
    ])
    // The caret is the user's, so it is left alone: the executing line is
    // marked by its own background, gutter bar and arrow.
    instance.revealLineInCenterIfOutsideViewport(line)
  }, [line, source])

  return (
    <Editor
      height="100%"
      language="python"
      theme="dsa-dark"
      value={source}
      onChange={(value) => onChange(value ?? '')}
      loading={<div className="empty-state">loading editor…</div>}
      beforeMount={(monaco) => monaco.editor.defineTheme('dsa-dark', THEME)}
      onMount={(instance, monaco) => {
        editorRef.current = instance
        monacoRef.current = monaco
        decorationsRef.current = instance.createDecorationsCollection()
        instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current())
      }}
      options={{
        readOnly: false,
        fontSize: 13,
        fontFamily: 'var(--font-mono), ui-monospace, Menlo, monospace',
        lineHeight: 24,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderLineHighlight: 'none',
        occurrencesHighlight: 'off',
        selectionHighlight: false,
        smoothScrolling: true,
        padding: { top: 10, bottom: 10 },
        lineNumbersMinChars: 3,
        glyphMargin: true,
        folding: false,
        contextmenu: false,
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      }}
    />
  )
}
