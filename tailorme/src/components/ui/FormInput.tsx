import type { InputHTMLAttributes, ReactNode } from 'react'

type FormInputProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
  error?: string
  labelAction?: ReactNode
  trailingControl?: ReactNode
}

export default function FormInput({ id, label, error, labelAction, trailingControl, className = '', ...props }: FormInputProps) {
  const errorId = `${id}-error`
  return (
    <div className="group">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
        <label htmlFor={id} className="text-label-md text-on-surface-variant group-focus-within:text-primary">{label}</label>
        {labelAction}
      </div>
      <div className="relative">
        <input {...props} id={id} aria-invalid={Boolean(error)} aria-describedby={[props['aria-describedby'],error ? errorId : undefined].filter(Boolean).join(' ') || undefined}
          className={`login-input w-full bg-transparent border-0 border-b border-outline-variant py-3 px-0 text-body-md text-primary transition-colors ${trailingControl ? 'pr-12' : ''} ${className}`} />
        {trailingControl}
      </div>
      {error && <p id={errorId} className="mt-2 text-sm text-error">{error}</p>}
    </div>
  )
}
