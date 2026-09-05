import { json } from '@sveltejs/kit';
import { offlineClient, offlineResponseHeaders as headers } from '$lib/server/offlineTransport';

async function invoke(request, action, deviceId) {
  let client;
  try { client = offlineClient(request); } catch { return json({enabled:false,error:'Serviço indisponível.'},{status:503,headers}); }
  if (!client) return json({enabled:false,error:'Autenticação necessária.'},{status:401,headers});
  if (typeof deviceId !== 'string' || !deviceId.trim() || deviceId.length > 200) return json({enabled:false,error:'Aparelho inválido.'},{status:400,headers});
  const {data,error} = await client.rpc('offline_bootstrap_v1',{p_device_id:deviceId,p_action:action});
  if (error) {
    if (['PGRST202','42883'].includes(error.code)) return json({enabled:false,available:false,reason:'protocol_unavailable'},{headers});
    return json({enabled:false,error:'Não foi possível preparar o acesso offline.'},{status:error.code==='42501'?403:['PGRST301','28000'].includes(error.code)?401:503,headers});
  }
  return json(data,{headers});
}
export async function GET({request,url}) { return invoke(request,'read',url.searchParams.get('deviceId')); }
export async function POST({request}) {
  const body = await request.json().catch(() => null);
  if (!['register','set_primary','enable','disable'].includes(body?.action)) return json({error:'Ação inválida.'},{status:400,headers});
  return invoke(request,body.action,body.deviceId);
}
