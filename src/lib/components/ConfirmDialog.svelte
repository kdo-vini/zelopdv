<script>
  import { confirmModal } from '$lib/stores/ui';
  import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
  } from '$lib/components/ui/alert-dialog/index.js';

  function handleConfirm() {
    if ($confirmModal.resolve) $confirmModal.resolve(true);
  }

  function handleCancel() {
    if ($confirmModal.resolve) $confirmModal.resolve(false);
  }

  let open = $derived($confirmModal.isOpen);
</script>

<AlertDialog {open}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{$confirmModal.title}</AlertDialogTitle>
      {#if $confirmModal.message}
        <AlertDialogDescription>{$confirmModal.message}</AlertDialogDescription>
      {/if}
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onclick={handleCancel}>Cancelar</AlertDialogCancel>
      <AlertDialogAction onclick={handleConfirm}>Confirmar</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
