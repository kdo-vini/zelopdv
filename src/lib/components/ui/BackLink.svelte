<script>
  // Link de "voltar" padrão para sub-páginas (ex.: tool dentro de /ferramentas).
  // Ver docs/DESIGN_PATTERNS.md → "Cabeçalho de página / breadcrumb".
  export let href;
  export let label = "Voltar";
</script>

<a class="back-link" {href}>
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path
      fill-rule="evenodd"
      d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z"
      clip-rule="evenodd"
    />
  </svg>
  {label}
</a>

<style>
  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 600;
    text-decoration: none;
    transition: color var(--transition-fast);
  }

  .back-link svg {
    width: 1rem;
    height: 1rem;
  }

  .back-link:hover {
    color: var(--primary);
  }
</style>
