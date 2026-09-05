import { handleOnlineClose } from '$lib/server/offlineOnlineClose';
export async function POST({request}) { return handleOnlineClose(request,'mesa.close'); }
