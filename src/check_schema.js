
import { supabase } from '$lib/supabaseClient';

async function checkSchema() {
    const { data, error } = await supabase.from('vendas').select('id_pessoa').limit(1);
    console.log('Check id_pessoa:', { data, error });
    // Also check for 'id_cliente'
    const { data: d2, error: e2 } = await supabase.from('vendas').select('id_cliente').limit(1);
    console.log('Check id_cliente:', { d2, error: e2 });
}

checkSchema();
