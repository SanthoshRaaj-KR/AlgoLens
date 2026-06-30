'use client'
import { createContext, useCallback, useContext, useRef, useState } from 'react'

type ToastType = 'error' | 'success' | 'warning'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastCtx {
  toast: (msg: string, type?: ToastType) => void
}

const Ctx = createContext<ToastCtx>({ toast: () => {} })

export function useToast() {
  return useContext(Ctx)
}

const COLORS: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  error:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',   text: '#fca5a5', icon: '✕' },
  success: { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.35)',  text: '#6ee7b7', icon: '✓' },
  warning: { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)',  text: '#fcd34d', icon: '⚠' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const toast = useCallback((message: string, type: ToastType = 'error') => {
    const id = ++counter.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }, [])

  const dismiss = (id: number) =>
    setToasts(prev => prev.filter(t => t.id !== id))

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'none',
        maxWidth: 420,
      }}>
        {toasts.map(t => {
          const c = COLORS[t.type]
          return (
            <div
              key={t.id}
              className="anim-slide-in"
              style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                pointerEvents: 'all',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
            >
              <span style={{ color: c.text, fontSize: 13, flexShrink: 0, fontFamily: 'var(--font-geist-mono)', fontWeight: 700 }}>
                {c.icon}
              </span>
              <span style={{ color: c.text, fontSize: 12, fontFamily: 'var(--font-geist-mono)', flex: 1, lineHeight: 1.5 }}>
                {t.message}
              </span>
              <button
                onClick={() => dismiss(t.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: c.text,
                  cursor: 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                  flexShrink: 0,
                  opacity: 0.6,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}
