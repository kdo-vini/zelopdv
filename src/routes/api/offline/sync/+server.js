import { json } from '@sveltejs/kit';
import { offlineClient, offlineResponseHeaders as headers } from '$lib/server/offlineTransport';
import { validateOfflineBatch, classifyOfflineRpcError } from '$lib/server/offlineProtocol';

export async function POST({request}) {
  if (Number(request.headers.get('content-length')) > 2_000_000) return json({error:'Lote muito grande.'},{status:413,headers});
  let client;
  try { client = offlineClient(request); } catch { return json({error:'Serviço indisponível.'},{status:503,headers}); }
  if (!client) return json({error:'Autenticação necessária.'},{status:401,headers});
  let operations;
  try {
    const raw = await request.text();
    if (raw.length > 2_000_000) return json({error:'Lote muito grande.'},{status:413,headers});
    operations = validateOfflineBatch(JSON.parse(raw));
  } catch (error) { return json({error:error.message || 'Lote inválido.'},{status:400,headers}); }
  const results = [];
  for (const operation of operations) {
    const {data, error} = await client.rpc('apply_offline_operation_v1', {p_operation: operation});
    if (error) {
      if (['PGRST301','PGRST302','28000'].includes(error.code)) return json({error:'Entre novamente para sincronizar.'},{status:401,headers});
      const status = classifyOfflineRpcError(error);
      // Do not turn uncertain transport failures into terminal acknowledgements.
      if (status === 'retry') return json({error:'Sincronização temporariamente indisponível.',results},{status:503,headers});
      results.push({operationId:operation.operationId,status,code:error.code,error:error.message});
    } else results.push(data);
  }
  return json({results},{headers});
}
