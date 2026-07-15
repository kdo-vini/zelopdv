<script>
	import { Select as SelectPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		placeholder,
		...restProps
	} = $props();
</script>

<SelectPrimitive.Value bind:ref {placeholder} data-slot="select-value" {...restProps} />

<style>
	:global([data-slot='select-value'][data-placeholder]) {
		color: var(--text-muted);
	}
</style>
