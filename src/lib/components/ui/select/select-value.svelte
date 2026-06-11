<script>
	import { Select as SelectPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		placeholder,
		children,
		...restProps
	} = $props();
</script>

<SelectPrimitive.Value bind:ref {placeholder} {...restProps}>
	{#if children}
		{@render children?.()}
	{/if}
</SelectPrimitive.Value>
