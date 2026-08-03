<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export type SearchableOption = {
	id: string
	label: string
	/** Extra text matched by search (e.g. raw id) */
	keywords?: string
}

const props = withDefaults(
	defineProps<{
		modelValue: string
		options: SearchableOption[]
		disabled?: boolean
		placeholder?: string
	}>(),
	{
		disabled: false,
		placeholder: 'Search servers…',
	},
)

const emit = defineEmits<{
	'update:modelValue': [value: string]
}>()

const open = ref(false)
const query = ref('')
const rootEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const activeIndex = ref(0)
const menuStyle = ref<Record<string, string>>({})

const selected = computed(() => props.options.find((o) => o.id === props.modelValue) ?? null)

const filtered = computed(() => {
	const q = query.value.trim().toLowerCase()
	if (!q) return props.options
	return props.options.filter((o) => {
		const hay = `${o.label} ${o.id} ${o.keywords ?? ''}`.toLowerCase()
		return hay.includes(q)
	})
})

watch(
	() => props.modelValue,
	() => {
		if (!open.value) query.value = ''
	},
)

watch(filtered, (list) => {
	if (activeIndex.value >= list.length) activeIndex.value = Math.max(0, list.length - 1)
})

function displayValue() {
	if (open.value) return query.value
	return selected.value?.label ?? ''
}

function positionMenu() {
	const el = rootEl.value
	if (!el) return
	const rect = el.getBoundingClientRect()
	const maxH = 224
	const spaceBelow = window.innerHeight - rect.bottom - 8
	const spaceAbove = rect.top - 8
	const openUp = spaceBelow < Math.min(maxH, 160) && spaceAbove > spaceBelow
	const height = Math.min(maxH, openUp ? spaceAbove : spaceBelow)
	menuStyle.value = {
		position: 'fixed',
		left: `${Math.max(8, rect.left)}px`,
		width: `${Math.max(rect.width, 12)}px`,
		maxHeight: `${Math.max(120, height)}px`,
		zIndex: '10050',
		...(openUp
			? { bottom: `${window.innerHeight - rect.top + 4}px`, top: 'auto' }
			: { top: `${rect.bottom + 4}px`, bottom: 'auto' }),
	}
}

function openMenu() {
	if (props.disabled) return
	open.value = true
	query.value = ''
	activeIndex.value = Math.max(
		0,
		filtered.value.findIndex((o) => o.id === props.modelValue),
	)
	nextTick(() => {
		positionMenu()
		inputEl.value?.focus()
	})
}

function closeMenu() {
	open.value = false
	query.value = ''
}

function pick(id: string) {
	emit('update:modelValue', id)
	closeMenu()
}

function onInput(e: Event) {
	query.value = (e.target as HTMLInputElement).value
	open.value = true
	activeIndex.value = 0
	nextTick(positionMenu)
}

function onKeydown(e: KeyboardEvent) {
	if (props.disabled) return
	if (!open.value && (e.key === 'ArrowDown' || e.key === 'Enter')) {
		e.preventDefault()
		openMenu()
		return
	}
	if (!open.value) return
	if (e.key === 'Escape') {
		e.preventDefault()
		closeMenu()
		return
	}
	if (e.key === 'ArrowDown') {
		e.preventDefault()
		activeIndex.value = Math.min(activeIndex.value + 1, filtered.value.length - 1)
		return
	}
	if (e.key === 'ArrowUp') {
		e.preventDefault()
		activeIndex.value = Math.max(activeIndex.value - 1, 0)
		return
	}
	if (e.key === 'Enter') {
		e.preventDefault()
		const opt = filtered.value[activeIndex.value]
		if (opt) pick(opt.id)
	}
}

function onDocPointer(e: MouseEvent) {
	if (!open.value) return
	const t = e.target as Node
	if (rootEl.value?.contains(t) || menuEl.value?.contains(t)) return
	closeMenu()
}

function onViewportChange() {
	if (open.value) positionMenu()
}

onMounted(() => {
	document.addEventListener('mousedown', onDocPointer)
	window.addEventListener('resize', onViewportChange)
	window.addEventListener('scroll', onViewportChange, true)
})
onBeforeUnmount(() => {
	document.removeEventListener('mousedown', onDocPointer)
	window.removeEventListener('resize', onViewportChange)
	window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<template>
	<div ref="rootEl" class="searchable-select" :class="{ open, disabled }">
		<input
			ref="inputEl"
			class="searchable-select-input"
			type="text"
			role="combobox"
			:aria-expanded="open"
			aria-autocomplete="list"
			:disabled="disabled"
			:placeholder="selected ? selected.label : placeholder"
			:value="displayValue()"
			@focus="openMenu"
			@click="openMenu"
			@input="onInput"
			@keydown="onKeydown"
		/>
		<Teleport to="body">
			<ul
				v-if="open"
				ref="menuEl"
				class="searchable-select-menu"
				role="listbox"
				:style="menuStyle"
			>
				<li v-if="!filtered.length" class="searchable-select-empty">No servers match</li>
				<li
					v-for="(opt, i) in filtered"
					:key="opt.id"
					role="option"
					class="searchable-select-option"
					:class="{ active: i === activeIndex, selected: opt.id === modelValue }"
					:aria-selected="opt.id === modelValue"
					@mousedown.prevent="pick(opt.id)"
					@mouseenter="activeIndex = i"
				>
					{{ opt.label }}
				</li>
			</ul>
		</Teleport>
	</div>
</template>

<style scoped>
.searchable-select {
	position: relative;
	width: 100%;
	min-width: 0;
}

.searchable-select.disabled {
	opacity: 0.65;
}

.searchable-select-input {
	width: 100%;
	max-width: 100%;
	min-width: 0;
	padding: 0.55rem 0.65rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text);
	font: inherit;
	box-sizing: border-box;
}

.searchable-select-input:focus {
	outline: 2px solid color-mix(in srgb, var(--realm-accent) 45%, transparent);
	outline-offset: 1px;
}
</style>

<!-- Teleported menu lives on body; keep styles global for this component. -->
<style>
.searchable-select-menu {
	margin: 0;
	padding: 0.25rem;
	list-style: none;
	overflow: auto;
	border-radius: var(--radius, 10px);
	border: 1px solid var(--realm-border, #2e2a3d);
	background: var(--realm-surface, #12101a);
	box-shadow: 0 8px 24px color-mix(in srgb, #000 22%, transparent);
	box-sizing: border-box;
}

.searchable-select-option,
.searchable-select-empty {
	padding: 0.45rem 0.55rem;
	border-radius: calc(var(--radius, 10px) - 2px);
	font-size: 0.88rem;
	cursor: pointer;
	color: var(--realm-text, #f4efe8);
}

.searchable-select-empty {
	cursor: default;
	color: var(--realm-text-muted, #9a9188);
}

.searchable-select-option.active,
.searchable-select-option:hover {
	background: color-mix(in srgb, var(--realm-accent, #d4634a) 16%, transparent);
}

.searchable-select-option.selected {
	font-weight: 600;
}
</style>
