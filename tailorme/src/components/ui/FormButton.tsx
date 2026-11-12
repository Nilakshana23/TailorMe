import type { ButtonHTMLAttributes } from 'react'

type FormButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
}

export default function FormButton({ variant = 'primary', className = '', type = 'button', ...props }: FormButtonProps) {
  const appearance = variant === 'primary'
    ? 'w-full bg-primary text-on-primary py-4 hover:opacity-90'
    : 'border border-outline-variant py-3 hover:bg-surface-container-low'
  return <button type={type} className={`min-h-11 rounded-lg text-label-md transition-colors flex items-center justify-center gap-2 ${appearance} ${className}`} {...props} />
}
