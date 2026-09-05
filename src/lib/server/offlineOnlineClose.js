import { json } from '@sveltejs/kit';
import { offlineClient, offlineResponseHeaders as headers } from './offlineTransport';

export async function handleOnlineClose(request, kind) {
  let client;
  try { client=offlineClient(request); } catch { return json({error:'Serviço indisponível.'},{status:503,headers}); }
  if (!client) return json({error:'Autenticação necessária.'},{status:401,headers});
  const body=await request.json().catch(()=>null);
  if (!body || typeof body.clientOperationId!=='string' || body.clientOperationId.length>180 || !body.clientOperationId.length) return json({error:'Identificação do fechamento necessária.'},{status:400,headers});
  const {clientOperationId,...payload}=body;
  const {data,error}=await client.rpc('apply_online_close_v1',{p_kind:kind,p_payload:payload,p_client_id:clientOperationId});
  if (error) return json({error:error.message,code:error.code},{status:['28000','PGRST301'].includes(error.code)?401:error.code==='42501'?403:['P0001','22023','23514'].includes(error.code)?409:503,headers});
  return json(data,{headers});
}
