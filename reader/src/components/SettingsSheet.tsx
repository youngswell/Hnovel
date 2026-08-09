import type { ReaderSettings } from '../lib/readerStore'

interface Props {
  open: boolean
  settings: ReaderSettings
  onChange: (next: ReaderSettings) => void
  onClose: () => void
}

const THEMES = [
  { key: 'day', label: '白', bg: '#f5f2ed', color: '#2c2416' },
  { key: 'sepia', label: '护眼', bg: '#f3ead8', color: '#4a3f2e' },
  { key: 'night', label: '夜间', bg: '#111111', color: '#b6b1a8' },
  { key: 'system', label: '跟随系统', bg: 'linear-gradient(90deg,#f5f2ed 50%,#111111 50%)', color: '#6b6258' },
] as const

const FONTS = [
  { key: 'serif', label: '衬线' },
  { key: 'sans', label: '黑体' },
] as const

const ALIGNS = [
  { key: 'justify', label: '两端对齐' },
  { key: 'left', label: '左对齐' },
] as const

const FONT_SIZES = [16, 18, 19, 21, 23, 26]
const LINE_HEIGHTS = [1.6, 1.75, 1.8, 1.95, 2.1]

export default function SettingsSheet({ open, settings, onChange, onClose }: Props) {
  if (!open) return null

  const set = (patch: Partial<ReaderSettings>) => onChange({ ...settings, ...patch })

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />

      <div className="relative w-full rounded-t-2xl bg-bg-card shadow-lg animate-sheet-up">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" />

        {/* 主题 */}
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-sm text-text-secondary">背景</span>
          <div className="flex gap-2">
            {THEMES.map(t => (
              <button
                key={t.key}
                onClick={() => set({ theme: t.key })}
                className={`flex h-9 min-w-12 items-center justify-center rounded-lg px-2 text-xs transition ${
                  settings.theme === t.key ? 'ring-2 ring-primary-dark' : 'ring-1 ring-border'
                }`}
                style={{ background: t.bg, color: t.color }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 字体 */}
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-sm text-text-secondary">字体</span>
          <div className="flex gap-2">
            {FONTS.map(f => (
              <button
                key={f.key}
                onClick={() => set({ fontFamily: f.key })}
                className={`rounded-lg px-3 py-1.5 text-xs transition ${
                  settings.fontFamily === f.key
                    ? 'bg-primary-light text-primary-dark'
                    : 'bg-border/50 text-text-secondary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* 对齐 */}
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-sm text-text-secondary">对齐</span>
          <div className="flex gap-2">
            {ALIGNS.map(a => (
              <button
                key={a.key}
                onClick={() => set({ align: a.key })}
                className={`rounded-lg px-3 py-1.5 text-xs transition ${
                  settings.align === a.key
                    ? 'bg-primary-light text-primary-dark'
                    : 'bg-border/50 text-text-secondary'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* 字号 */}
        <div className="px-5 pt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-text-secondary">字号</span>
            <span className="text-xs text-text-muted">{settings.fontSize}px</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const i = FONT_SIZES.indexOf(settings.fontSize)
                set({ fontSize: FONT_SIZES[Math.max(0, i - 1)] })
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-border/50 text-lg text-text-secondary active:opacity-70"
            >
              −
            </button>
            <div className="flex flex-1 items-center justify-between rounded-lg bg-border/30 px-2 py-1.5">
              {FONT_SIZES.map(s => (
                <button
                  key={s}
                  onClick={() => set({ fontSize: s })}
                  className={`flex h-6 flex-1 items-center justify-center rounded text-xs transition ${
                    settings.fontSize === s ? 'bg-primary text-white' : 'text-text-muted'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                const i = FONT_SIZES.indexOf(settings.fontSize)
                set({ fontSize: FONT_SIZES[Math.min(FONT_SIZES.length - 1, i + 1)] })
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-border/50 text-lg text-text-secondary active:opacity-70"
            >
              ＋
            </button>
          </div>
        </div>

        {/* 行距 */}
        <div className="px-5 pb-8 pt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-text-secondary">行距</span>
            <span className="text-xs text-text-muted">{settings.lineHeight.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const i = LINE_HEIGHTS.indexOf(settings.lineHeight)
                set({ lineHeight: LINE_HEIGHTS[Math.max(0, i - 1)] })
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-border/50 text-lg text-text-secondary active:opacity-70"
            >
              −
            </button>
            <div className="flex flex-1 items-center justify-between rounded-lg bg-border/30 px-2 py-1.5">
              {LINE_HEIGHTS.map(lh => (
                <button
                  key={lh}
                  onClick={() => set({ lineHeight: lh })}
                  className={`flex h-6 flex-1 items-center justify-center rounded text-[11px] transition ${
                    settings.lineHeight === lh ? 'bg-primary text-white' : 'text-text-muted'
                  }`}
                >
                  {lh.toFixed(2)}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                const i = LINE_HEIGHTS.indexOf(settings.lineHeight)
                set({ lineHeight: LINE_HEIGHTS[Math.min(LINE_HEIGHTS.length - 1, i + 1)] })
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-border/50 text-lg text-text-secondary active:opacity-70"
            >
              ＋
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
