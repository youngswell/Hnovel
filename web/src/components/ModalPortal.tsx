import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm modal-enter"
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>,
    document.body,
  )
}
