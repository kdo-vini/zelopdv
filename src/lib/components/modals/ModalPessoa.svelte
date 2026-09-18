<script>
  import { tick, untrack } from 'svelte';
  import { X, Check, Plus } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient';
  import { maskPhone } from '$lib/masks';
  import * as Select from '$lib/components/ui/select/index.js';

  /**
   * @typedef {object} PessoaFormSource
   * @property {string|number} [id]
   * @property {string} [nome]
   * @property {string} [tipo]
   * @property {string} [contato]
   * @property {number|null} [aniversario_dia]
   * @property {number|null} [aniversario_mes]
   * @property {number|null} [aniversario_ano]
   */

  /**
   * @type {{
   *   open?: boolean,
   *   pessoa?: PessoaFormSource | null,
   *   ownerUserId?: string | null,
   *   onclose?: () => void,
   *   onsaved?: () => void
   * }}
   */
  let {
    open = false,
    pessoa = null,
    ownerUserId = null,
    onclose,
    onsaved,
  } = $props();

  function emptyForm() {
    return {
      id: /** @type {string|number|null} */ (null),
      nome: '',
      tipo: 'cliente',
      contato: '',
      aniversario_dia: /** @type {number|string|null} */ (null),
      aniversario_mes: /** @type {number|string|null} */ (null),
      aniversario_ano: /** @type {number|string|null} */ (null),
    };
  }

  /** @param {PessoaFormSource | null | undefined} p */
  function formFromPessoa(p) {
    if (!p) return emptyForm();
    return {
      id: p.id ?? null,
      nome: p.nome || '',
      tipo: p.tipo || 'cliente',
      contato: maskPhone(p.contato || ''),
      aniversario_dia: p.aniversario_dia ?? null,
      aniversario_mes: p.aniversario_mes ?? null,
      aniversario_ano: p.aniversario_ano ?? null,
    };
  }

  // Instância remonta via {#key} no pai — untrack evita state_referenced_locally.
  let form = $state(untrack(() => formFromPessoa(pessoa)));
  let errorMsg = $state('');
  let saving = $state(false);

  function focusOnMount(node) {
    void tick().then(() => {
      if (node.isConnected) node.focus();
    });
  }

  function birthdayPayload() {
    const dia = form.aniversario_dia === '' || form.aniversario_dia == null ? null : Number(form.aniversario_dia);
    const mes = form.aniversario_mes === '' || form.aniversario_mes == null ? null : Number(form.aniversario_mes);
    const ano = form.aniversario_ano === '' || form.aniversario_ano == null ? null : Number(form.aniversario_ano);
    if ((dia === null) !== (mes === null)) {
      errorMsg = 'Informe dia e mês do aniversário juntos.';
      return null;
    }
    if (dia !== null && (!Number.isInteger(dia) || dia < 1 || dia > 31)) {
      errorMsg = 'O dia do aniversário deve estar entre 1 e 31.';
      return null;
    }
    if (mes !== null && (!Number.isInteger(mes) || mes < 1 || mes > 12)) {
      errorMsg = 'O mês do aniversário deve estar entre 1 e 12.';
      return null;
    }
    if (ano !== null && (!Number.isInteger(ano) || ano < 1900 || ano > 2100)) {
      errorMsg = 'Informe um ano de aniversário válido.';
      return null;
    }
    return { aniversario_dia: dia, aniversario_mes: mes, aniversario_ano: ano };
  }

  function close() {
    onclose?.();
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  async function save(e) {
    e?.preventDefault?.();
    errorMsg = '';
    if (!form.nome.trim()) {
      errorMsg = 'Informe o nome.';
      return;
    }
    const digits = (form.contato || '').replace(/\D/g, '');
    if (digits && digits.length > 11) {
      errorMsg = 'Contato deve ter no máximo 11 dígitos.';
      return;
    }
    const birthday = birthdayPayload();
    if (!birthday) return;

    saving = true;
    try {
      if (form.id) {
        const { error } = await supabase
          .from('pessoas')
          .update({ nome: form.nome, tipo: form.tipo, contato: form.contato, ...birthday })
          .eq('id', form.id);
        if (error) {
          errorMsg = 'Não foi possível salvar o cadastro. Tente novamente.';
          return;
        }
      } else {
        let uid = ownerUserId;
        if (!uid) {
          const { data: userData } = await supabase.auth.getUser();
          uid = userData?.user?.id || null;
        }
        const payload = { nome: form.nome, tipo: form.tipo, contato: form.contato, ...birthday };
        if (uid) payload.id_usuario = uid;
        const { error } = await supabase.from('pessoas').insert(payload);
        if (error) {
          errorMsg = 'Não foi possível salvar o cadastro. Tente novamente.';
          return;
        }
      }
      onsaved?.();
      close();
    } finally {
      saving = false;
    }
  }

  let isEdit = $derived(!!form.id);
  let title = $derived(isEdit ? 'Editar pessoa' : 'Nova pessoa');
</script>

{#if open}
  <dialog
    open
    class="modal-backdrop"
    aria-modal="true"
    aria-labelledby="modal-pessoa-title"
    tabindex="-1"
    onkeydown={handleKeydown}
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div class="modal-box" role="document">
      <div class="modal-header">
        <h2 id="modal-pessoa-title" class="modal-title">{title}</h2>
        <button type="button" class="modal-close" aria-label="Fechar" onclick={close}>
          <X class="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <form class="modal-body" onsubmit={save}>
        {#if errorMsg}
          <div class="error-banner" role="alert">{errorMsg}</div>
        {/if}

        <label class="block">
          <span class="form-label">Nome</span>
          <input
            class="form-input"
            bind:value={form.nome}
            placeholder="Nome completo"
            use:focusOnMount
          />
        </label>

        <label class="block">
          <span class="form-label">Tipo</span>
          <Select.Root bind:value={form.tipo}>
            <Select.Trigger class="form-input">
              {form.tipo === 'funcionario' ? 'Funcionário' : 'Cliente'}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="cliente" label="Cliente" />
              <Select.Item value="funcionario" label="Funcionário" />
            </Select.Content>
          </Select.Root>
        </label>

        <label class="block">
          <span class="form-label">Contato</span>
          <input
            class="form-input"
            value={form.contato}
            placeholder="(00) 00000-0000"
            inputmode="numeric"
            oninput={(e) => {
              form.contato = maskPhone(e.currentTarget.value);
              e.currentTarget.value = form.contato;
            }}
          />
        </label>

        <fieldset class="birthday-fields">
          <legend class="form-label">Aniversário</legend>
          <div class="birthday-grid">
            <input
              class="form-input"
              type="number"
              min="1"
              max="31"
              bind:value={form.aniversario_dia}
              placeholder="Dia"
              aria-label="Dia do aniversário"
            />
            <input
              class="form-input"
              type="number"
              min="1"
              max="12"
              bind:value={form.aniversario_mes}
              placeholder="Mês"
              aria-label="Mês do aniversário"
            />
            <input
              class="form-input"
              type="number"
              min="1900"
              max="2100"
              bind:value={form.aniversario_ano}
              placeholder="Ano (opcional)"
              aria-label="Ano do aniversário"
            />
          </div>
        </fieldset>

        <div class="modal-footer">
          <button type="button" class="btn-ghost" onclick={close}>Cancelar</button>
          <button type="submit" class="btn-primary" disabled={saving}>
            {#if isEdit}
              <Check class="w-4 h-4" aria-hidden="true" />
              Salvar
            {:else}
              <Plus class="w-4 h-4" aria-hidden="true" />
              Cadastrar
            {/if}
          </button>
        </div>
      </form>
    </div>
  </dialog>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    width: auto;
    max-width: none;
    height: auto;
    margin: 0;
    border: 0;
    padding: 1rem;
    background: color-mix(in srgb, var(--bg-app) 60%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .modal-backdrop::backdrop {
    background: transparent;
  }

  .modal-box {
    width: 100%;
    max-width: 440px;
    border-radius: 0.75rem;
    border: 1px solid var(--border-card);
    background: var(--bg-card);
    overflow: hidden;
    box-shadow: var(--shadow-modal);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .modal-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 0;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .modal-close:hover {
    background: var(--sidebar-item-hover-bg);
    color: var(--text-main);
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1.25rem;
    color: var(--text-main);
  }

  .error-banner {
    padding: 0.625rem 0.875rem;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--error) 25%, transparent);
    background: color-mix(in srgb, var(--error) 10%, transparent);
    color: var(--status-error-text);
    font-size: 0.875rem;
  }

  .form-label {
    display: block;
    margin-bottom: 0.375rem;
    color: var(--text-label);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .form-input {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    background: var(--bg-input);
    color: var(--text-main);
    font-size: 0.875rem;
    outline: none;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .form-input::placeholder {
    color: var(--text-muted);
  }

  .form-input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 1px var(--primary);
  }

  .birthday-fields {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  .birthday-grid {
    display: grid;
    grid-template-columns: 0.8fr 0.8fr 1.2fr;
    gap: 0.5rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 1rem;
    margin-top: 0.25rem;
    border-top: 1px solid var(--border-subtle);
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    min-height: 2.5rem;
    padding: 0.5rem 1rem;
    border: 0;
    border-radius: 0.5rem;
    background: var(--primary);
    color: var(--primary-text);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .btn-ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.5rem;
    padding: 0.5rem 0.875rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .btn-ghost:hover {
    background: var(--sidebar-item-hover-bg);
    color: var(--text-main);
  }

  @media (max-width: 640px) {
    .modal-backdrop {
      align-items: flex-start;
      overflow-y: auto;
    }

    .modal-box {
      max-height: calc(100dvh - 2rem);
      overflow-x: hidden;
      overflow-y: auto;
    }

    .modal-footer {
      flex-direction: column-reverse;
    }

    .modal-footer button {
      width: 100%;
    }
  }
</style>
