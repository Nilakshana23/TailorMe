import type { ApplicationFields, ApplicationStatus } from '../services/applicationService'

export const emptyApplication: ApplicationFields = {
  shop_name: '', phone: '', city: '', address: '', description: '', specialties: '', years_experience: null,
}
export const applicationLimits = { shop_name: 160, phone: 32, city: 120, address: 500, description: 4000, specialties: 500 } as const
export type ApplicationErrors = Partial<Record<keyof ApplicationFields, string>>
export function canEditApplication(status?: ApplicationStatus) {
  return !status || status === 'draft' || status === 'rejected'
}
export function validateApplication(fields: ApplicationFields, submit: boolean): ApplicationErrors {
  const errors: ApplicationErrors = {}
  for (const [field, max] of Object.entries(applicationLimits)) {
    const key = field as keyof typeof applicationLimits
    if ([...fields[key].trim()].length > max) errors[key] = `Use ${max} characters or fewer.`
  }
  if (fields.years_experience !== null && (!Number.isInteger(fields.years_experience) || fields.years_experience < 0 || fields.years_experience > 80)) {
    errors.years_experience = 'Enter a whole number from 0 to 80.'
  }
  if (submit) {
    for (const [field, min] of Object.entries({ shop_name: 2, city: 2, address: 5, description: 20, specialties: 2 })) {
      const key = field as keyof typeof applicationLimits
      if ([...fields[key].trim()].length < min) errors[key] = `Enter at least ${min} characters.`
    }
    const phone = fields.phone.trim()
    const digits = phone.replace(/[^0-9]/g, '')
    if (!/^[+0-9() .-]{7,32}$/.test(phone) || digits.length < 7 || digits.length > 15) errors.phone = 'Enter a valid phone number with 7–15 digits.'
    if (fields.years_experience === null) errors.years_experience = 'Enter your years of experience (0–80).'
  }
  return errors
}
