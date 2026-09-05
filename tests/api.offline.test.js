import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({rpc:vi.fn(),client:vi.fn()}));
vi.mock('$lib/server/offlineTransport',()=>({offlineClient:state.client,offlineResponseHeaders:{'cache-control':'no-store'}}));
import {POST as sync} from '../src/routes/api/offline/sync/+server.js';
import {GET as bootstrap} from '../src/routes/api/offline/bootstrap/+server.js';
import {POST as close} from '../src/routes/api/caixa/close/+server.js';

const op=id=>({operationId:id,schemaVersion:1,type:'sale.create',ownerUserId:'owner',operatorId:'actor',deviceId:'device',entityType:'sale',entityId:id,sequence:1,dependencies:[],occurredAt:'2026-09-05T12:00:00Z',payload:{}});
const request=body=>new Request('https://example.invalid/api/offline/sync',{method:'POST',headers:{Authorization:'Bearer user-token'},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();state.client.mockReturnValue({rpc:state.rpc});});
describe('offline authenticated endpoints',()=>{
  it('rejects missing auth before dispatch',async()=>{
    state.client.mockReturnValue(null);
    expect((await sync({request:request({operations:[op('a')]})})).status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('preserves partial batch results without acknowledging uncertain writes',async()=>{
    state.rpc.mockResolvedValueOnce({data:{operationId:'a',status:'applied',result:{id:1}}}).mockResolvedValueOnce({error:{code:'57014'}});
    const response=await sync({request:request({operations:[op('a'),op('b')]})});
    expect(response.status).toBe(503);
    expect((await response.json()).results).toEqual([{operationId:'a',status:'applied',result:{id:1}}]);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('does not lose the stable intent when forwarding a retry',async()=>{
    const operation=op('stable'); state.rpc.mockResolvedValue({data:{operationId:'stable',status:'already_applied',result:{id:5}}});
    const response=await sync({request:request({operations:[operation]})});
    expect(response.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith('apply_offline_operation_v1',{p_operation:operation});
  });
  it('never enables offline when the migration is unavailable',async()=>{
    state.rpc.mockResolvedValue({error:{code:'PGRST202'}});
    const response=await bootstrap({request:request({}),url:new URL('https://example.invalid/api/offline/bootstrap?deviceId=abc')});
    expect(await response.json()).toMatchObject({enabled:false,available:false});
  });
  it('online closing uses the same immutable client ID without offline registration',async()=>{
    state.rpc.mockResolvedValue({data:{status:'applied',result:{id:4}}});
    const response=await close({request:request({clientOperationId:'close-4',id_caixa:4,valor_contado_em_gaveta:120})});
    expect(response.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith('apply_online_close_v1',{p_kind:'caixa.close',p_client_id:'close-4',p_payload:{id_caixa:4,valor_contado_em_gaveta:120}});
  });
});
