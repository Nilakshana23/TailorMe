import {supabase} from '../lib/supabase'
export type BankFields={account_holder:string;bank:string;branch:string;account_number:string}
export type BankAccount=BankFields&{owner_id:string;version:number;updated_at:string}
export type Payment={id:string;request_id:string;quote_id:string;method:'cash'|'bank_transfer';amount:string;paid_on:string;reference:string;receipt_path:string|null;destination:BankFields|null;created_at:string;status:'pending'|'confirmed'|'rejected';reason:string|null;decided_at:string|null;version:number}
export type PaymentState={eligible:boolean;quote_id:string|null;total:string|null;confirmed:string;awaiting:string;balance:string|null;bank:BankAccount|null;payments:Payment[]}
export type PaymentSubmission={id:string;requestId:string;quoteId:string;method:'cash'|'bank_transfer';amount:string;paidOn:string;reference:string;receiptId:string|null;bankVersion:number|null;destination:BankFields|null;receiptPath:string|null}
function client(){if(!supabase)throw Error('Authentication unavailable.');return supabase}
async function rpc<T>(name:string,args:object):Promise<T>{const {data,error}=await client().rpc(name,args);if(error)throw Object.assign(new Error(error.message),{code:error.code});return data as T}
export function paymentAmount(value:string){const match=/^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim());if(!match)throw Error('Enter a positive LKR amount with no more than two decimal places.');const n=`${match[1].replace(/^0+(?=\d)/,'')}.${(match[2]??'').padEnd(2,'0')}`;if(n==='0.00')throw Error('Enter a positive payment amount.');return n}
export const paymentService={
 state:(requestId:string)=>rpc<PaymentState>('request_payment_state',{p_request_id:requestId}),
 async bank(ownerId:string):Promise<BankAccount|null>{const {data,error}=await client().from('tailor_bank_accounts').select('*').eq('owner_id',ownerId).maybeSingle();if(error)throw Error('Unable to load your bank details.');return data},
 saveBank:(fields:BankFields,version:number|null)=>rpc<BankAccount>('save_tailor_bank',{p_fields:fields,p_expected_version:version}),
 report:(s:PaymentSubmission)=>rpc<string>('report_request_payment',{p_id:s.id,p_request_id:s.requestId,p_quote_id:s.quoteId,p_method:s.method,p_amount:s.amount,p_paid_on:s.paidOn,p_reference:s.reference,p_receipt_id:s.receiptId,p_bank_version:s.bankVersion}),
 decide:(id:string,status:'confirmed'|'rejected',reason:string,version:number,confirm:boolean)=>rpc<string>('decide_request_payment',{p_id:id,p_status:status,p_reason:reason,p_expected_version:version,p_confirm_received:confirm}),
}
