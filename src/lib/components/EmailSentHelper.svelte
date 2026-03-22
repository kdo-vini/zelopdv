<script>
  /** Email do usuário — usado para detectar o provedor e montar o link direto. */
  export let email = '';

  const providers = [
    {
      domains: ['gmail.com', 'googlemail.com'],
      label: 'Abrir Gmail',
      url: 'https://mail.google.com/mail/u/0/#inbox',
      bg: '#EA4335',
    },
    {
      domains: ['outlook.com', 'hotmail.com', 'hotmail.com.br', 'live.com', 'live.com.br', 'msn.com'],
      label: 'Abrir Outlook',
      url: 'https://outlook.live.com/mail/inbox',
      bg: '#0078D4',
    },
    {
      domains: ['yahoo.com', 'yahoo.com.br'],
      label: 'Abrir Yahoo Mail',
      url: 'https://mail.yahoo.com',
      bg: '#6001D2',
    },
    {
      domains: ['icloud.com', 'me.com', 'mac.com'],
      label: 'Abrir iCloud Mail',
      url: 'https://www.icloud.com/mail',
      bg: '#1C7EED',
    },
    {
      domains: ['protonmail.com', 'proton.me', 'pm.me'],
      label: 'Abrir ProtonMail',
      url: 'https://mail.proton.me',
      bg: '#6D4AFF',
    },
    {
      domains: ['uol.com.br', 'bol.com.br'],
      label: 'Abrir UOL Mail',
      url: 'https://email.uol.com.br',
      bg: '#FF6600',
    },
    {
      domains: ['terra.com.br'],
      label: 'Abrir Terra Mail',
      url: 'https://webmail.terra.com.br',
      bg: '#00A651',
    },
  ];

  $: domain = email?.split('@')?.[1]?.toLowerCase().trim() ?? '';
  $: provider = providers.find(p => p.domains.includes(domain)) ?? null;
</script>

<div class="email-helper">
  <p class="spam-tip">
    <svg xmlns="http://www.w3.org/2000/svg" class="tip-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
    Não recebeu? Verifique também sua <strong>caixa de spam</strong>.
  </p>

  {#if provider}
    <a
      href={provider.url}
      target="_blank"
      rel="noopener noreferrer"
      class="open-email-btn"
      style="background: {provider.bg};"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
      {provider.label}
      <svg xmlns="http://www.w3.org/2000/svg" class="btn-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
      </svg>
    </a>
  {/if}
</div>

<style>
  .email-helper {
    margin-top: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .spam-tip {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--text-muted);
    margin: 0;
  }

  .tip-icon {
    width: 0.9rem;
    height: 0.9rem;
    flex-shrink: 0;
    color: var(--warning);
  }

  .open-email-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.9rem;
    border-radius: 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: #fff;
    text-decoration: none;
    width: fit-content;
    transition: opacity 0.15s, transform 0.1s;
  }

  .open-email-btn:hover {
    opacity: 0.88;
    transform: translateY(-1px);
  }

  .open-email-btn:active {
    transform: translateY(0);
  }

  .btn-icon {
    width: 0.95rem;
    height: 0.95rem;
    flex-shrink: 0;
  }

  .btn-arrow {
    width: 0.75rem;
    height: 0.75rem;
    flex-shrink: 0;
    opacity: 0.8;
  }
</style>
