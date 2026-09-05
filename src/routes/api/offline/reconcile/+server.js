import { json } from '@sveltejs/kit';
import { offlineClient, offlineResponseHeaders as headers } from '$lib/server/offlineTransport';

export async function POST({request}) {
  let client;
  try { client = offlineClient(request); } catch { return json({error:'Serviço indisponível.'},{status:503,headers}); }
  if (!client) return json({error:'Autenticação necessária.'},{status:401,headers});
  const body = await request.json().catch(() => null);
  if (!body || typeof body.operationId !== 'string' || typeof body.note !== 'string'
    || body.note.trim().length < 5 || body.note.length > 2000
    || !['record_duplicate','retry','record_additional_sale','record_refund'].includes(body.action)) return json({error:'Decisão de conferência inválida.'},{status:400,headers});
  const {data,error} = await client.rpc('reconcile_offline_operation_v1',{p_operation_id:body.operationId,p_action:body.action,p_note:body.note});
  if (error) return json({error:error.message},{status:error.code==='42501'?403:409,headers});
  return json(data,{headers});
}
