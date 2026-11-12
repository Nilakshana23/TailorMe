import { supabase, configurationError } from '../lib/supabase'

export type ApplicationStatus = 'draft' | 'pending' | 'approved' | 'rejected'
export type ApplicationFields = {
  shop_name: string; phone: string; city: string; address: string
  description: string; specialties: string; years_experience: number | null
}
export type TailorApplication = ApplicationFields & {
  applicant_id: string; status: ApplicationStatus; reviewer_id: string | null
  reviewed_at: string | null; rejection_reason: string | null
  created_at: string; updated_at: string; version: number
}
export type ApplicationFilter = ApplicationStatus | 'all'

function client() {
  if (!supabase) throw new Error(configurationError ?? 'Authentication is unavailable.')
  return supabase
}
const columns = 'applicant_id,shop_name,phone,city,address,description,specialties,years_experience,status,reviewer_id,reviewed_at,rejection_reason,created_at,updated_at,version'

export const applicationService = {
  async own(userId: string): Promise<TailorApplication | null> {
    const { data, error } = await client().from('tailor_applications').select(columns).eq('applicant_id', userId).maybeSingle()
    if (error) throw new Error(error.message)
    return data as TailorApplication | null
  },
  async list(status: ApplicationFilter, page: number): Promise<{ applications: TailorApplication[]; count: number }> {
    let query = client().from('tailor_applications').select(columns, { count: 'exact' })
    if (status !== 'all') query = query.eq('status', status)
    const { data, error, count } = await query.order('updated_at', { ascending: false }).order('applicant_id').range(page * 20, page * 20 + 19)
    if (error) throw new Error(error.message)
    return { applications: data as TailorApplication[], count: count ?? 0 }
  },
  async save(fields: ApplicationFields, submit: boolean, version: number | null): Promise<TailorApplication> {
    const { data, error } = await client().rpc('save_tailor_application', {
      p_shop_name: fields.shop_name, p_phone: fields.phone, p_city: fields.city, p_address: fields.address,
      p_description: fields.description, p_specialties: fields.specialties, p_years_experience: fields.years_experience,
      p_submit: submit, p_expected_version: version,
    })
    if (error) throw new Error(error.message)
    return data as TailorApplication
  },
  async review(application: TailorApplication, decision: 'approved' | 'rejected', reason: string): Promise<TailorApplication> {
    const { data, error } = await client().rpc('review_tailor_application', {
      p_applicant_id: application.applicant_id, p_decision: decision,
      p_rejection_reason: decision === 'rejected' ? reason.trim() : null, p_expected_version: application.version,
    })
    if (error) throw new Error(error.message)
    return data as TailorApplication
  },
}
