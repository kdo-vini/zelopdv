<script>
  import { onMount, tick } from 'svelte';
  import { getAccessContext } from '$lib/accessControl';
  import { supabase } from '$lib/supabaseClient';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import * as Select from '$lib/components/ui/select/index.js';

  // ─── State ───────────────────────────────────────────────────────────────────
  let loading = true;
  let addonActive = true; // false → show upsell screen

  let roles = [];
  let users = [];
  let addons = { mesas: false, zeloMenu: false };

  let activeTab = 'cargos'; // 'cargos' | 'usuarios'

  // Cargos tab
  let expandedRoleId = null;
  let newRoleName = '';
  let showNewRoleForm = false;
  let creatingRole = false;
  // debounce timers per role id
  const saveTimers = {};

  // Usuários tab
  let showInviteModal = false;
  let inviteEmail = '';
  let inviteRoleId = '';
  let inviting = false;
  let inviteError = '';

  function focusOnMount(node) {
    void tick().then(() => {
      if (node.isConnected) node.focus();
    });
  }

  // Inline role change
  let editingUserRoleId = null; // user id whose role is being changed inline
  let editingUserRoleValue = '';

  // ─── Permission groups ───────────────────────────────────────────────────────
  const PERMISSION_GROUPS = [
    {
      label: 'PDV',
      items: [
        { key: 'pdv.acessar', label: 'Acessar PDV' },
        { key: 'pdv.vender', label: 'Vender' },
        { key: 'pdv.receber', label: 'Receber pagamento' },
        { key: 'pdv.desconto', label: 'Aplicar desconto' },
        { key: 'pdv.cancelar', label: 'Cancelar venda' },
      ],
    },
    {
      label: 'Caixa',
      items: [
        { key: 'caixa.abrir', label: 'Abrir caixa' },
        { key: 'caixa.fechar', label: 'Fechar caixa' },
        { key: 'caixa.movimentar', label: 'Movimentar caixa' },
        { key: 'caixa.ver', label: 'Ver caixa atual' },
      ],
    },
    {
      label: 'Produtos / Estoque',
      items: [
        { key: 'produtos.visualizar', label: 'Visualizar produtos' },
        { key: 'produtos.gerenciar', label: 'Gerenciar produtos' },
        { key: 'estoque.visualizar', label: 'Visualizar estoque' },
        { key: 'estoque.ajustar', label: 'Ajustar estoque' },
      ],
    },
    {
      label: 'Pessoas / Fiado',
      items: [
        { key: 'pessoas.visualizar', label: 'Visualizar pessoas' },
        { key: 'pessoas.gerenciar', label: 'Gerenciar pessoas' },
        { key: 'fiado.visualizar', label: 'Visualizar fiado' },
        { key: 'fiado.receber', label: 'Receber fiado' },
      ],
    },
    {
      label: 'Financeiro',
      items: [
        { key: 'despesas.visualizar', label: 'Visualizar despesas' },
        { key: 'despesas.gerenciar', label: 'Gerenciar despesas' },
        { key: 'relatorios.ver', label: 'Ver relatórios' },
        { key: 'relatorios.exportar', label: 'Exportar relatórios' },
      ],
    },
    {
      label: 'Perfil',
      items: [
        { key: 'perfil.editar', label: 'Editar dados operacionais' },
      ],
    },
    {
      label: 'Mesas',
      requiresAddon: 'mesas',
      items: [
        { key: 'mesas.acessar', label: 'Acessar mesas' },
        { key: 'mesas.abrir_comanda', label: 'Abrir comanda' },
        { key: 'mesas.editar_itens', label: 'Editar itens' },
        { key: 'mesas.fechar', label: 'Fechar/receber mesa' },
        { key: 'mesas.cancelar', label: 'Cancelar/liberar mesa' },
      ],
    },
    {
      label: 'Pedidos do ZeloMenu',
      requiresAddon: 'zeloMenu',
      // As chaves seguem com o prefixo `pedidos.` de propósito: estão persistidas
      // no JSON de `access_roles` e renomeá-las apagaria a permissão de quem já
      // está cadastrado. O rótulo é o que mudou.
      items: [
        { key: 'pedidos.acessar', label: 'Acessar fila de pedidos' },
        { key: 'pedidos.cozinha', label: 'Painel de cozinha' },
        { key: 'pedidos.receber', label: 'Concluir pedido no caixa' },
        { key: 'pedidos.cancelar', label: 'Cancelar/rejeitar pedido' },
      ],
    },
  ];

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  function authHeader(token) {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  // ─── Load data ───────────────────────────────────────────────────────────────
  async function loadData() {
    loading = true;
    const token = await getToken();
    if (!token) { loading = false; return; }

    try {
      const [rolesRes, usersRes] = await Promise.all([
        fetch('/api/access/roles', { headers: authHeader(token) }),
        fetch('/api/access/users', { headers: authHeader(token) }),
      ]);

      if (rolesRes.status === 403 || usersRes.status === 403) {
        addonActive = false;
        loading = false;
        return;
      }

      if (!rolesRes.ok || !usersRes.ok) {
        addToast('Erro ao carregar dados de acessos', 'error');
        loading = false;
        return;
      }

      const rolesData = await rolesRes.json();
      const usersData = await usersRes.json();

      roles = rolesData.roles ?? [];
      users = usersData.users ?? [];
      addons = usersData.addons ?? { mesas: false, zeloMenu: false };

      // NOTE: default roles (Proprietário, Gerente, Operador) are created
      // automatically by ensureDefaultRoles() inside POST /api/access/users,
      // which runs the first time a user is invited. If roles is empty here,
      // they will be seeded on first invite.
    } catch (e) {
      addToast('Erro ao carregar dados: ' + e.message, 'error');
    } finally {
      loading = false;
    }
  }

  // ─── Cargos logic ────────────────────────────────────────────────────────────
  function toggleExpand(roleId) {
    expandedRoleId = expandedRoleId === roleId ? null : roleId;
  }

  function hasPermission(role, key) {
    return !!(role.permissions && role.permissions[key]);
  }

  function onPermissionChange(role, key, value) {
    // Mutate local permissions immediately for responsive UI
    role.permissions = { ...(role.permissions ?? {}), [key]: value };
    roles = roles; // trigger reactivity

    // Clear existing debounce timer for this role
    if (saveTimers[role.id]) clearTimeout(saveTimers[role.id]);

    saveTimers[role.id] = setTimeout(() => {
      patchRole(role);
    }, 800);
  }

  async function patchRole(role) {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/access/roles/${role.id}`, {
        method: 'PATCH',
        headers: authHeader(token),
        body: JSON.stringify({ permissions: role.permissions }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addToast('Erro ao salvar permissões: ' + (err.error ?? res.statusText), 'error');
      } else {
        addToast('Permissões salvas', 'success');
      }
    } catch (e) {
      addToast('Erro ao salvar permissões: ' + e.message, 'error');
    }
  }

  async function createRole() {
    if (!newRoleName.trim()) {
      addToast('Informe o nome do cargo', 'warning');
      return;
    }
    creatingRole = true;
    const token = await getToken();
    if (!token) { creatingRole = false; return; }
    try {
      const res = await fetch('/api/access/roles', {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({ name: newRoleName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast('Erro ao criar cargo: ' + (data.error ?? res.statusText), 'error');
      } else {
        addToast('Cargo criado!', 'success');
        newRoleName = '';
        showNewRoleForm = false;
        await loadData();
      }
    } catch (e) {
      addToast('Erro: ' + e.message, 'error');
    } finally {
      creatingRole = false;
    }
  }

  async function deleteRole(role) {
    const confirmed = await confirmAction(
      `Excluir cargo "${role.name}"?`,
      'Todos os usuários com este cargo ficarão sem cargo atribuído. Esta ação não pode ser desfeita.'
    );
    if (!confirmed) return;
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/access/roles/${role.id}`, {
        method: 'DELETE',
        headers: authHeader(token),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addToast('Erro ao excluir cargo: ' + (err.error ?? res.statusText), 'error');
      } else {
        addToast('Cargo excluído', 'success');
        if (expandedRoleId === role.id) expandedRoleId = null;
        await loadData();
      }
    } catch (e) {
      addToast('Erro: ' + e.message, 'error');
    }
  }

  // ─── Usuários logic ──────────────────────────────────────────────────────────
  function openInviteModal() {
    inviteEmail = '';
    inviteRoleId = roles[0]?.id ?? '';
    inviteError = '';
    showInviteModal = true;
  }

  function closeInviteModal() {
    showInviteModal = false;
    inviteError = '';
  }

  async function inviteUser() {
    if (!inviteEmail.trim()) {
      inviteError = 'Informe o e-mail do usuário.';
      return;
    }
    if (!inviteRoleId) {
      inviteError = 'Selecione um cargo.';
      return;
    }
    inviting = true;
    inviteError = '';
    const token = await getToken();
    if (!token) { inviting = false; return; }
    try {
      const res = await fetch('/api/access/users', {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({ email: inviteEmail.trim(), role_id: inviteRoleId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        inviteError = data.error ?? 'Erro ao convidar usuário.';
      } else {
        addToast('Convite enviado para ' + inviteEmail.trim(), 'success');
        closeInviteModal();
        await loadData();
      }
    } catch (e) {
      inviteError = e.message;
    } finally {
      inviting = false;
    }
  }

  async function toggleUserStatus(user) {
    const newStatus = user.status === 'active' ? 'blocked' : 'active';
    const action = newStatus === 'blocked' ? 'bloquear' : 'desbloquear';
    const confirmed = await confirmAction(
      `${newStatus === 'blocked' ? 'Bloquear' : 'Desbloquear'} usuário?`,
      `Tem certeza que deseja ${action} o acesso de ${user.email}?`
    );
    if (!confirmed) return;
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/access/users/${user.id}`, {
        method: 'PATCH',
        headers: authHeader(token),
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addToast('Erro: ' + (err.error ?? res.statusText), 'error');
      } else {
        addToast(newStatus === 'active' ? 'Usuário desbloqueado' : 'Usuário bloqueado', 'success');
        await loadData();
      }
    } catch (e) {
      addToast('Erro: ' + e.message, 'error');
    }
  }

  async function removeUser(user) {
    const confirmed = await confirmAction(
      `Remover ${user.email}?`,
      'O usuário perderá acesso imediatamente. Esta ação não pode ser desfeita.'
    );
    if (!confirmed) return;
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/access/users/${user.id}`, {
        method: 'DELETE',
        headers: authHeader(token),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addToast('Erro: ' + (err.error ?? res.statusText), 'error');
      } else {
        addToast('Usuário removido', 'success');
        await loadData();
      }
    } catch (e) {
      addToast('Erro: ' + e.message, 'error');
    }
  }

  function startRoleChange(user) {
    editingUserRoleId = user.id;
    editingUserRoleValue = user.role_id ?? '';
  }

  function cancelRoleChange() {
    editingUserRoleId = null;
    editingUserRoleValue = '';
  }

  async function saveRoleChange(user) {
    if (!editingUserRoleValue) { cancelRoleChange(); return; }
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/access/users/${user.id}`, {
        method: 'PATCH',
        headers: authHeader(token),
        body: JSON.stringify({ role_id: editingUserRoleValue }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addToast('Erro: ' + (err.error ?? res.statusText), 'error');
      } else {
        addToast('Cargo alterado', 'success');
        cancelRoleChange();
        await loadData();
      }
    } catch (e) {
      addToast('Erro: ' + e.message, 'error');
    }
  }

  // ─── Helpers for template ─────────────────────────────────────────────────────
  function roleName(roleId) {
    return roles.find(r => r.id === roleId)?.name ?? '—';
  }

  function statusLabel(status) {
    if (status === 'active') return 'Ativo';
    if (status === 'blocked') return 'Bloqueado';
    return 'Pendente';
  }

  function statusStyle(status) {
    if (status === 'active') return 'background: var(--success-bg, #dcfce7); color: var(--success, #16a34a);';
    if (status === 'blocked') return 'background: var(--error-bg); color: var(--error);';
    return 'background: #fef9c3; color: #a16207;';
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────
  onMount(async () => {
    const ctx = await getAccessContext();
    if (ctx?.isSubUser) {
      addToast('Somente o titular pode acessar Controle de Acessos.', 'warning');
      window.location.href = '/gestao';
      return;
    }
    loadData();
  });
</script>

<svelte:head>
  <title>Controle de Acessos — Zelo PDV</title>
</svelte:head>

<!-- ─── Upsell screen ─────────────────────────────────────────────────────── -->
{#if !loading && !addonActive}
  <div class="space-y-6">
    <header>
      <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Configurações / Acessos</p>
      <h1 class="text-xl font-bold text-slate-100 tracking-tight">Controle de Acessos</h1>
    </header>
    <div class="rounded-xl border p-8 flex flex-col items-center text-center gap-4" style="background: var(--bg-card); border-color: var(--border-subtle);">
      <div class="w-14 h-14 rounded-full flex items-center justify-center" style="background: var(--accent-light);">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7" style="color: var(--primary);">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
        </svg>
      </div>
      <div>
        <h2 class="text-lg font-bold mb-1" style="color: var(--text-main);">Controle de Acessos não está ativo</h2>
        <p class="text-sm" style="color: var(--text-muted);">
          Ative o add-on de Controle de Acessos para criar cargos, definir permissões e convidar colaboradores para o seu sistema.
        </p>
      </div>
      <a
        href="/gestao/extensoes"
        class="px-5 py-2.5 rounded-lg text-sm font-semibold"
        style="background: var(--primary); color: var(--primary-text, #fff);"
      >
        Ver extensões disponíveis
      </a>
    </div>
  </div>

<!-- ─── Loading ───────────────────────────────────────────────────────────── -->
{:else if loading}
  <div class="flex items-center justify-center h-64">
    <div class="flex flex-col items-center gap-3">
      <Spinner />
      <p class="text-sm" style="color: var(--text-muted);">Carregando...</p>
    </div>
  </div>

<!-- ─── Main UI ───────────────────────────────────────────────────────────── -->
{:else}
  <div class="space-y-6">

    <!-- Header -->
    <header>
      <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Configurações / Acessos</p>
      <h1 class="text-xl font-bold text-slate-100 tracking-tight">Controle de Acessos</h1>
      <p class="text-sm mt-1" style="color: var(--text-muted);">Gerencie cargos, permissões e usuários do seu sistema.</p>
    </header>

    <!-- Tabs -->
    <div class="flex gap-1 p-1 rounded-lg w-fit" style="background: var(--bg-input);">
      <button
        class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
        style="
          background: {activeTab === 'cargos' ? 'var(--bg-card)' : 'transparent'};
          color: {activeTab === 'cargos' ? 'var(--text-main)' : 'var(--text-muted)'};
          box-shadow: {activeTab === 'cargos' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'};
        "
        on:click={() => activeTab = 'cargos'}
      >
        Cargos
      </button>
      <button
        class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
        style="
          background: {activeTab === 'usuarios' ? 'var(--bg-card)' : 'transparent'};
          color: {activeTab === 'usuarios' ? 'var(--text-main)' : 'var(--text-muted)'};
          box-shadow: {activeTab === 'usuarios' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'};
        "
        on:click={() => activeTab = 'usuarios'}
      >
        Usuários
        {#if users.length > 0}
          <span class="ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold" style="background: var(--accent-light); color: var(--accent);">{users.length}</span>
        {/if}
      </button>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <!-- TAB: CARGOS                                                             -->
    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    {#if activeTab === 'cargos'}
      <div class="space-y-3">

        {#if roles.length === 0}
          <div class="rounded-xl border p-8 text-center" style="background: var(--bg-card); border-color: var(--border-subtle);">
            <p class="text-sm" style="color: var(--text-muted);">
              Nenhum cargo encontrado. Os cargos padrão (Proprietário, Gerente, Operador) serão criados automaticamente ao convidar o primeiro usuário.
            </p>
          </div>
        {/if}

        {#each roles as role (role.id)}
          <div class="rounded-xl border overflow-hidden transition-shadow" style="background: var(--bg-card); border-color: var(--border-subtle);">
            <!-- Role header row -->
            <div class="flex items-center justify-between gap-3 px-4 py-3">
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-semibold text-sm" style="color: var(--text-main);">{role.name}</span>
                {#if role.is_system}
                  <span class="px-2 py-0.5 rounded-full text-xs font-semibold" style="background: var(--accent-light); color: var(--accent);">Padrão</span>
                {/if}
              </div>
              <div class="flex items-center gap-1 shrink-0">
                {#if !role.is_system}
                  <button
                    class="p-1.5 rounded-sm transition-colors"
                    style="color: var(--text-muted);"
                    title="Excluir cargo"
                    on:click={() => deleteRole(role)}
                    on:mouseenter={e => e.currentTarget.style.color = 'var(--error)'}
                    on:mouseleave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                {/if}
                <button
                  class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style="background: var(--bg-input); color: var(--text-muted);"
                  on:click={() => toggleExpand(role.id)}
                  aria-expanded={expandedRoleId === role.id}
                >
                  {expandedRoleId === role.id ? 'Fechar' : 'Editar permissões'}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none" viewBox="0 0 24 24"
                    stroke-width="2" stroke="currentColor"
                    class="w-3.5 h-3.5 transition-transform"
                    style="transform: rotate({expandedRoleId === role.id ? '180deg' : '0deg'});"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Permission accordion -->
            {#if expandedRoleId === role.id}
              <div class="border-t px-4 pb-4 pt-3 space-y-4" style="border-color: var(--border-subtle);">
                {#each PERMISSION_GROUPS as group}
                  {#if !group.requiresAddon || addons[group.requiresAddon]}
                    <div>
                      <p class="text-xs font-bold uppercase tracking-wider mb-2" style="color: var(--text-muted);">{group.label}</p>
                      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {#each group.items as item}
                          <label
                            class="permission-item"
                            class:permission-item-active={hasPermission(role, item.key)}
                            class:permission-item-inactive={!hasPermission(role, item.key)}
                          >
                            <input
                              type="checkbox"
                              class="checkbox-custom"
                              checked={hasPermission(role, item.key)}
                              on:change={e => onPermissionChange(role, item.key, e.target.checked)}
                            />
                            <span class="permission-copy">
                              <span class="permission-label">{item.label}</span>
                            </span>
                          </label>
                        {/each}
                      </div>
                    </div>
                  {/if}
                {/each}
                <p class="text-xs" style="color: var(--text-muted);">As alterações são salvas automaticamente após 0,8 s sem modificações.</p>
              </div>
            {/if}
          </div>
        {/each}

        <!-- New role form / button -->
        {#if showNewRoleForm}
          <div class="rounded-xl border p-4 flex items-center gap-3" style="background: var(--bg-card); border-color: var(--border-subtle);">
            <input
              type="text"
              placeholder="Nome do novo cargo"
              class="input-form flex-1 text-sm"
              bind:value={newRoleName}
              on:keydown={e => { if (e.key === 'Enter') createRole(); if (e.key === 'Escape') showNewRoleForm = false; }}
              use:focusOnMount
            />
            <button
              class="px-4 py-2 rounded-lg text-sm font-medium"
              style="background: var(--primary); color: var(--primary-text, #fff);"
              on:click={createRole}
              disabled={creatingRole}
            >
              {creatingRole ? 'Criando...' : 'Criar'}
            </button>
            <button
              class="px-3 py-2 rounded-lg text-sm font-medium"
              style="background: var(--bg-input); color: var(--text-muted);"
              on:click={() => { showNewRoleForm = false; newRoleName = ''; }}
            >
              Cancelar
            </button>
          </div>
        {:else}
          <button
            class="flex items-center gap-2 px-4 py-3 rounded-xl border w-full text-sm font-medium transition-colors"
            style="border-color: var(--border-subtle); color: var(--text-muted); background: transparent; border-style: dashed;"
            on:click={() => showNewRoleForm = true}
            on:mouseenter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)'; }}
            on:mouseleave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Novo cargo
          </button>
        {/if}

      </div>

    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <!-- TAB: USUÁRIOS                                                           -->
    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    {:else if activeTab === 'usuarios'}
      <div class="space-y-4">

        <!-- Sub-header with counter + invite button -->
        <div class="flex items-center justify-between gap-4">
          <p class="text-sm" style="color: var(--text-muted);">
            <span class="font-semibold" style="color: var(--text-main);">{users.length}</span> de <span class="font-semibold" style="color: var(--text-main);">5</span> usuários
          </p>
          <button
            class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style="background: var(--primary); color: var(--primary-text, #fff);"
            on:click={openInviteModal}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Convidar usuário
          </button>
        </div>

        <!-- Users table -->
        <div class="rounded-xl border overflow-hidden" style="background: var(--bg-card); border-color: var(--border-subtle);">
          {#if users.length === 0}
            <div class="p-8 text-center">
              <p class="text-sm" style="color: var(--text-muted);">Nenhum usuário convidado ainda. Clique em "Convidar usuário" para começar.</p>
            </div>
          {:else}
            <div class="overflow-x-auto">
              <table class="w-full text-sm text-left">
                <thead>
                  <tr style="border-bottom: 1px solid var(--border-subtle);">
                    <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">E-mail</th>
                    <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Cargo</th>
                    <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Status</th>
                    <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-right" style="color: var(--text-muted);">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {#each users as user (user.id)}
                    <tr
                      class="transition-colors"
                      style="border-bottom: 1px solid var(--border-subtle);"
                      on:mouseenter={e => e.currentTarget.style.background = 'var(--bg-hover, var(--bg-input))'}
                      on:mouseleave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <!-- E-mail -->
                      <td class="px-4 py-3 font-medium" style="color: var(--text-main);">{user.email}</td>

                      <!-- Cargo -->
                      <td class="px-4 py-3">
                        {#if editingUserRoleId === user.id}
                          <div class="flex items-center gap-1">
                            <Select.Root bind:value={editingUserRoleValue}>
                              <Select.Trigger class="field-input h-8">
                                <Select.Value placeholder="Selecione um cargo" />
                              </Select.Trigger>
                              <Select.Content>
                                {#each roles as r}
                                  <Select.Item value={r.id} label={r.name} />
                                {/each}
                              </Select.Content>
                            </Select.Root>
                            <button
                              class="p-1.5 rounded-sm"
                              style="color: var(--success);"
                              title="Salvar"
                              on:click={() => saveRoleChange(user)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            </button>
                            <button
                              class="p-1.5 rounded-sm"
                              style="color: var(--text-muted);"
                              title="Cancelar"
                              on:click={cancelRoleChange}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        {:else}
                          <span style="color: var(--text-muted);">{roleName(user.role_id)}</span>
                        {/if}
                      </td>

                      <!-- Status -->
                      <td class="px-4 py-3">
                        <span
                          class="px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={statusStyle(user.status)}
                        >
                          {statusLabel(user.status)}
                        </span>
                      </td>

                      <!-- Ações -->
                      <td class="px-4 py-3">
                        <div class="flex items-center justify-end gap-1">
                          <!-- Alterar cargo -->
                          {#if editingUserRoleId !== user.id}
                            <button
                              class="p-1.5 rounded-sm transition-colors"
                              style="color: var(--text-muted);"
                              title="Alterar cargo"
                              on:click={() => startRoleChange(user)}
                              on:mouseenter={e => e.currentTarget.style.color = 'var(--accent)'}
                              on:mouseleave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                              </svg>
                            </button>

                            <!-- Bloquear / Desbloquear -->
                            <button
                              class="p-1.5 rounded-sm transition-colors"
                              style="color: var(--text-muted);"
                              title={user.status === 'active' ? 'Bloquear' : 'Desbloquear'}
                              on:click={() => toggleUserStatus(user)}
                              on:mouseenter={e => e.currentTarget.style.color = user.status === 'active' ? 'var(--warning, #d97706)' : 'var(--success)'}
                              on:mouseleave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                            >
                              {#if user.status === 'active'}
                                <!-- Lock icon -->
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                              {:else}
                                <!-- Unlock icon -->
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                              {/if}
                            </button>

                            <!-- Remover -->
                            <button
                              class="p-1.5 rounded-sm transition-colors"
                              style="color: var(--text-muted);"
                              title="Remover usuário"
                              on:click={() => removeUser(user)}
                              on:mouseenter={e => e.currentTarget.style.color = 'var(--error)'}
                              on:mouseleave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          {/if}
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>
    {/if}

  </div>
{/if}

<!-- ─── Invite modal ──────────────────────────────────────────────────────── -->
{#if showInviteModal}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 mobile-bottom-nav-overlay flex items-center justify-center p-4"
    style="background: rgba(0,0,0,0.5);"
    role="dialog"
    aria-modal="true"
    aria-labelledby="invite-modal-title"
    tabindex="-1"
    on:click|self={closeInviteModal}
    on:keydown={e => e.key === 'Escape' && closeInviteModal()}
  >
    <div
      class="rounded-xl border w-full max-w-md p-6 space-y-5 mobile-bottom-nav-dialog"
      style="background: var(--bg-card); border-color: var(--border-subtle);"
      role="document"
    >
      <!-- Modal header -->
      <div class="flex items-center justify-between">
        <h2 id="invite-modal-title" class="text-lg font-bold" style="color: var(--text-main);">Convidar usuário</h2>
        <button
          class="p-1.5 rounded-lg transition-colors"
          style="color: var(--text-muted);"
          on:click={closeInviteModal}
          aria-label="Fechar"
          on:mouseenter={e => e.currentTarget.style.color = 'var(--text-main)'}
          on:mouseleave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Fields -->
      <div class="space-y-4">
        <div>
          <label for="invite-email" class="block text-xs font-medium mb-1" style="color: var(--text-muted);">E-mail</label>
          <input
            id="invite-email"
            type="email"
            placeholder="colaborador@email.com"
            class="input-form w-full"
            bind:value={inviteEmail}
            on:keydown={e => e.key === 'Enter' && inviteUser()}
          />
        </div>
        <div>
          <span class="block text-xs font-medium mb-1" style="color: var(--text-muted);">Cargo</span>
          <Select.Root bind:value={inviteRoleId}>
            <Select.Trigger class="field-input w-full">
              <Select.Value placeholder="Selecione um cargo" />
            </Select.Trigger>
            <Select.Content>
              {#if roles.length === 0}
                <Select.Item value="" label="Nenhum cargo disponível" />
              {/if}
              {#each roles as r}
                <Select.Item value={r.id} label={r.name} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      <!-- Error -->
      {#if inviteError}
        <div class="rounded-lg px-3 py-2 text-sm" style="background: var(--error-bg); color: var(--error);">
          {inviteError}
        </div>
      {/if}

      <!-- Actions -->
      <div class="flex items-center justify-end gap-2 pt-1">
        <button
          class="px-4 py-2 rounded-lg text-sm font-medium"
          style="background: var(--bg-input); color: var(--text-muted);"
          on:click={closeInviteModal}
        >
          Cancelar
        </button>
        <button
          class="px-4 py-2 rounded-lg text-sm font-semibold"
          style="background: var(--primary); color: var(--primary-text, #fff);"
          on:click={inviteUser}
          disabled={inviting}
        >
          {inviting ? 'Enviando...' : 'Convidar'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .input-form {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-subtle);
    background: var(--bg-input);
    color: var(--text-main);
    font-size: 0.875rem;
    transition: border-color 0.15s;
    box-sizing: border-box;
  }
  .input-form:focus {
    outline: none;
    border-color: var(--primary);
  }
  .input-form:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .permission-item {
    display: grid;
    grid-template-columns: 1.1rem minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    min-height: 3rem;
    padding: 0.7rem 0.8rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--bg-input) 84%, transparent);
    cursor: pointer;
    user-select: none;
    transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
  }
  .permission-item:hover {
    border-color: var(--border-strong);
    background: color-mix(in srgb, var(--bg-input) 92%, transparent);
  }
  .permission-item-active {
    border-color: var(--status-success-border);
    background: color-mix(in srgb, var(--status-success-bg) 70%, var(--bg-input));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--status-success-border) 35%, transparent);
  }
  .permission-item-inactive {
    opacity: 0.96;
  }
  .permission-copy {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .permission-label {
    color: var(--text-main);
    font-size: 0.92rem;
    line-height: 1.3;
  }

  /* Checkbox */
  .checkbox-custom {
    appearance: none;
    -webkit-appearance: none;
    width: 1.1rem;
    height: 1.1rem;
    margin: 0;
    display: grid;
    place-items: center;
    border-radius: 0.35rem;
    border: 1.5px solid var(--border-strong);
    background: color-mix(in srgb, var(--bg-card) 75%, white 2%);
    cursor: pointer;
    flex-shrink: 0;
    transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
  }
  .checkbox-custom::after {
    content: '';
    width: 0.58rem;
    height: 0.34rem;
    border-left: 2px solid var(--primary-text, #fff);
    border-bottom: 2px solid var(--primary-text, #fff);
    transform: rotate(-45deg) scale(0);
    transform-origin: center;
    transition: transform 0.14s ease;
  }
  .checkbox-custom:hover {
    border-color: var(--primary);
  }
  .checkbox-custom:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent);
  }
  .checkbox-custom:checked {
    background: var(--primary);
    border-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent);
  }
  .checkbox-custom:checked::after {
    transform: rotate(-45deg) scale(1);
  }
  .permission-item-active .checkbox-custom {
    border-color: var(--status-success-border);
  }

  @media (max-width: 640px) {
    .permission-copy {
      align-items: center;
    }
  }

  /* Spinner */
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
