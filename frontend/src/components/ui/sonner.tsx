"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

const SuccessIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--color-yes)]">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ErrorIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--color-no)]">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M15 9l-6 6m0-6l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      icons={{
        success: <SuccessIcon />,
        error: <ErrorIcon />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:transition-shadow",
          success:
            "group-[.toaster]:border-[var(--color-yes)]/20 hover:group-[.toaster]:shadow-[0_0_16px_rgba(91,140,90,0.25)]",
          error:
            "group-[.toaster]:border-[var(--color-no)]/20 hover:group-[.toaster]:shadow-[0_0_16px_rgba(184,112,112,0.25)]",
          description: "group-[.toaster]:text-muted-foreground",
        },
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
