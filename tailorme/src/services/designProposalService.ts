import {supabase} from '../lib/supabase'
import type {ChatImage} from './chatImageService'
import type {DesignSnapshot} from './designService'
export type DesignProposal={id:string;request_id:string;explanation:string;images:ChatImage[];base_version:number;request_version:number;status:'pending'|'accepted'|'declined'|'withdrawn';version:number;created_at:string;decided_at:string|null;decided_by:string|null}
export type AgreedDesign={request_id:string;version:number;proposal_id:string|null;original_snapshot:DesignSnapshot|null;images:ChatImage[];explanation:string;agreed_at:string}
export type ProposalSubmission={id:string;requestId:string;explanation:string;images:ChatImage[];requestVersion:number;designVersion:number}
function client(){if(!supabase)throw Error('Authentication unavailable.');return supabase}
export const designProposalService={
 async load(requestId:string):Promise<{proposals:DesignProposal[];designs:AgreedDesign[]}>{
  const [proposals,designs]=await Promise.all([client().from('design_change_proposals').select('*').eq('request_id',requestId).order('created_at',{ascending:false}).order('id'),client().from('request_agreed_designs').select('*').eq('request_id',requestId).order('version',{ascending:false})])
  if(proposals.error||designs.error)throw Error('Unable to load agreed design and proposals. Refresh to retry.')
  return {proposals:proposals.data,designs:designs.data}
 },
 async propose(submission:ProposalSubmission):Promise<DesignProposal>{const {data,error}=await client().rpc('propose_request_design',{p_id:submission.id,p_request_id:submission.requestId,p_explanation:submission.explanation,p_images:submission.images.map(image=>image.id),p_expected_request_version:submission.requestVersion,p_expected_design_version:submission.designVersion});if(error)throw Object.assign(new Error(error.message),{code:error.code});return data},
 async decide(id:string,status:'accepted'|'declined'|'withdrawn',version:number,confirm=false):Promise<DesignProposal>{const {data,error}=await client().rpc('decide_request_design',{p_id:id,p_status:status,p_expected_version:version,p_confirm:confirm});if(error)throw Object.assign(new Error(error.message),{code:error.code});return data},
}
