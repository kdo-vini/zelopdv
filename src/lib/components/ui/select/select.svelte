<script>
	import { Select as SelectPrimitive } from "bits-ui";

	let {
		open = $bindable(false),
		value = $bindable(),
		type = "single",
		...restProps
	} = $props();
</script>

<SelectPrimitive.Root bind:open bind:value={value} {type} {...restProps} />
