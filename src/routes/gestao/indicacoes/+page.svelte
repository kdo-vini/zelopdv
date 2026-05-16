<script>
  import ReferralCard from '$lib/components/ReferralCard.svelte';
</script>

<svelte:head>
  <title>Minhas indicações — ZeloPDV</title>
</svelte:head>

<section class="wrap">
  <div class="header">
    <div>
      <p>Gestão / Indicações</p>
      <h1>Minhas indicações</h1>
    </div>
  </div>

  <ReferralCard />
</section>

<style>
  .wrap {
    padding: 16px;
    max-width: 1100px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  p {
    margin: 0 0 0.25rem;
    color: var(--text-muted);
    text-transform: uppercase;
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.12em;
  }

  h1 {
    margin: 0;
    color: var(--text-main);
    font-size: 1.6rem;
  }
</style>
