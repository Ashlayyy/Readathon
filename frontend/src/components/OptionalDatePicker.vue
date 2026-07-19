<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{
	modelValue: string;
	label: string;
	disabled?: boolean;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: string];
}>();

const enabled = ref(!!props.modelValue);
const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);
const searchIgnore = ref(false);

const today = new Date();
today.setHours(0, 0, 0, 0);

const cursor = ref(startOfMonth(props.modelValue ? parseIso(props.modelValue) : today));

watch(
	() => props.modelValue,
	(v) => {
		if (searchIgnore.value) return;
		enabled.value = !!v;
		if (v) cursor.value = startOfMonth(parseIso(v));
	},
);

watch(enabled, (on, wasOn) => {
	if (props.disabled) return;
	if (!on) {
		open.value = false;
		if (props.modelValue) emit('update:modelValue', '');
		return;
	}
	if (!wasOn && !props.modelValue) {
		nextTick(() => openPicker());
	}
});

const displayLabel = computed(() => {
	if (!props.modelValue) return 'Choose a date';
	const d = parseIso(props.modelValue);
	return d.toLocaleDateString(undefined, {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
});

const monthLabel = computed(() =>
	cursor.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
);

const weekdayLabels = computed(() => {
	const base = new Date(2024, 0, 7); // Sunday
	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date(base);
		d.setDate(base.getDate() + i);
		return d.toLocaleDateString(undefined, { weekday: 'narrow' });
	});
});

const cells = computed(() => {
	const year = cursor.value.getFullYear();
	const month = cursor.value.getMonth();
	const first = new Date(year, month, 1);
	const startPad = first.getDay();
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const items: {
		key: string;
		day: number | null;
		iso: string | null;
		isToday: boolean;
		isSelected: boolean;
		outside: boolean;
	}[] = [];

	for (let i = 0; i < startPad; i++) {
		items.push({
			key: `pad-${i}`,
			day: null,
			iso: null,
			isToday: false,
			isSelected: false,
			outside: true,
		});
	}

	for (let day = 1; day <= daysInMonth; day++) {
		const d = new Date(year, month, day);
		const iso = toIso(d);
		items.push({
			key: iso,
			day,
			iso,
			isToday: sameDay(d, today),
			isSelected: props.modelValue === iso,
			outside: false,
		});
	}

	return items;
});

function parseIso(iso: string) {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function toIso(d: Date) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

function sameDay(a: Date, b: Date) {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

function shiftMonth(delta: number) {
	const d = new Date(cursor.value);
	d.setMonth(d.getMonth() + delta);
	cursor.value = startOfMonth(d);
}

function pick(iso: string) {
	searchIgnore.value = true;
	emit('update:modelValue', iso);
	open.value = false;
	queueMicrotask(() => {
		searchIgnore.value = false;
	});
}

function openPicker() {
	if (props.disabled || !enabled.value) return;
	if (props.modelValue) cursor.value = startOfMonth(parseIso(props.modelValue));
	else cursor.value = startOfMonth(today);
	open.value = true;
}

function closePicker() {
	open.value = false;
}

function toggleEnabled() {
	if (props.disabled) return;
	enabled.value = !enabled.value;
}

function onDocPointerDown(e: PointerEvent) {
	if (!open.value) return;
	const t = e.target as Node;
	if (rootRef.value?.contains(t)) return;
	if (popoverRef.value?.contains(t)) return;
	closePicker();
}

watch(open, (isOpen) => {
	if (isOpen) document.addEventListener('pointerdown', onDocPointerDown);
	else document.removeEventListener('pointerdown', onDocPointerDown);
});

onBeforeUnmount(() => {
	document.removeEventListener('pointerdown', onDocPointerDown);
});
</script>

<template>
	<div
		ref="rootRef"
		class="optional-date"
		:class="{ disabled, enabled, open }"
	>
		<div class="date-head">
			<span class="date-label">{{ label }}</span>
			<button
				type="button"
				class="date-toggle"
				role="switch"
				:aria-checked="enabled"
				:disabled="disabled"
				:aria-label="enabled ? `Disable ${label}` : `Enable ${label}`"
				@click="toggleEnabled"
			>
				<span class="date-toggle-knob" aria-hidden="true" />
			</button>
		</div>

		<button
			v-if="enabled"
			type="button"
			class="date-trigger"
			:class="{ placeholder: !modelValue }"
			:disabled="disabled"
			:aria-expanded="open"
			aria-haspopup="dialog"
			@click="open ? closePicker() : openPicker()"
		>
			<span class="date-trigger-text">{{ displayLabel }}</span>
			<span class="date-trigger-icon" aria-hidden="true">
				<svg
					viewBox="0 0 24 24"
					width="18"
					height="18"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<rect x="3" y="5" width="18" height="16" rx="2" />
					<path d="M3 9h18M8 3v4M16 3v4" />
				</svg>
			</span>
		</button>
		<p v-else class="date-off-hint">Off — not recorded</p>

		<Teleport to="body">
			<template v-if="open">
				<div
					class="cal-backdrop"
					aria-hidden="true"
					@click="closePicker"
				/>
				<div
					ref="popoverRef"
					class="cal-popover"
					role="dialog"
					aria-modal="true"
					aria-label="Choose date"
					@keydown.escape.prevent="closePicker"
				>
					<div class="cal-toolbar">
						<button
							type="button"
							class="cal-nav"
							aria-label="Previous month"
							@click="shiftMonth(-1)"
						>
							‹
						</button>
						<strong class="cal-month">{{ monthLabel }}</strong>
						<button
							type="button"
							class="cal-nav"
							aria-label="Next month"
							@click="shiftMonth(1)"
						>
							›
						</button>
					</div>
					<div class="cal-weekdays">
						<span v-for="(w, i) in weekdayLabels" :key="i">{{ w }}</span>
					</div>
					<div class="cal-grid">
						<button
							v-for="cell in cells"
							:key="cell.key"
							type="button"
							class="cal-day"
							:class="{
								empty: cell.outside,
								today: cell.isToday,
								selected: cell.isSelected,
							}"
							:disabled="cell.outside || !cell.iso"
							@click="cell.iso && pick(cell.iso)"
						>
							{{ cell.day }}
						</button>
					</div>
					<div class="cal-footer">
						<button
							type="button"
							class="cal-today-btn"
							@click="pick(toIso(today))"
						>
							Today
						</button>
						<button type="button" class="cal-close-btn" @click="closePicker">
							Close
						</button>
					</div>
				</div>
			</template>
		</Teleport>
	</div>
</template>

<style scoped>
.optional-date {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 0.45rem;
	font-size: 0.85rem;
	font-weight: 600;
	color: var(--realm-text-muted);
}

.optional-date.disabled {
	opacity: 0.85;
}

.date-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
}

.date-label {
	min-width: 0;
}

.date-toggle {
	position: relative;
	width: 2.6rem;
	height: 1.45rem;
	padding: 0;
	border: 1px solid var(--realm-border);
	border-radius: 999px;
	background: var(--realm-bg);
	cursor: pointer;
	flex-shrink: 0;
	transition:
		background 0.2s,
		border-color 0.2s;
}

.date-toggle:disabled {
	cursor: default;
}

.optional-date.enabled .date-toggle {
	background: rgba(212, 99, 74, 0.35);
	border-color: var(--realm-accent);
}

.date-toggle-knob {
	position: absolute;
	top: 2px;
	left: 2px;
	width: 1.05rem;
	height: 1.05rem;
	border-radius: 50%;
	background: var(--realm-text-muted);
	transition:
		transform 0.2s,
		background 0.2s;
}

.optional-date.enabled .date-toggle-knob {
	transform: translateX(1.1rem);
	background: #fff;
}

.date-trigger {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.65rem;
	width: 100%;
	padding: 0.55rem 0.7rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text);
	font-family: var(--font-body);
	font-size: 0.95rem;
	font-weight: 500;
	text-align: left;
	cursor: pointer;
}

.date-trigger:hover:not(:disabled),
.optional-date.open .date-trigger {
	border-color: rgba(212, 99, 74, 0.5);
}

.date-trigger.placeholder {
	color: var(--realm-text-muted);
}

.date-trigger:disabled {
	cursor: default;
}

.date-trigger-icon {
	display: flex;
	color: var(--realm-text-muted);
	flex-shrink: 0;
}

.date-off-hint {
	margin: 0;
	padding: 0.45rem 0.15rem;
	font-size: 0.82rem;
	font-weight: 500;
	color: var(--realm-text-muted);
	opacity: 0.85;
}

.cal-backdrop {
	position: fixed;
	inset: 0;
	z-index: 1200;
	background: rgba(0, 0, 0, 0.55);
	backdrop-filter: blur(3px);
}

.cal-popover {
	position: fixed;
	z-index: 1201;
	left: 50%;
	top: 50%;
	transform: translate(-50%, -50%);
	width: min(22rem, calc(100vw - 2rem));
	padding: 0.95rem;
	border-radius: 14px;
	border: 1px solid var(--realm-border);
	background: var(--realm-surface);
	box-shadow: var(--shadow);
}

.cal-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	margin-bottom: 0.75rem;
}

.cal-month {
	font-family: var(--font-display);
	font-size: 0.95rem;
	color: var(--realm-text);
	font-weight: 700;
}

.cal-nav {
	width: 2.1rem;
	height: 2.1rem;
	border-radius: 8px;
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text);
	font-size: 1.25rem;
	line-height: 1;
	cursor: pointer;
}

.cal-nav:hover {
	border-color: rgba(212, 99, 74, 0.45);
	color: var(--realm-accent-glow);
}

.cal-weekdays {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 0.15rem;
	margin-bottom: 0.35rem;
	text-align: center;
	font-size: 0.7rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--realm-text-muted);
}

.cal-grid {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 0.2rem;
}

.cal-day {
	aspect-ratio: 1;
	min-height: 2.15rem;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: var(--realm-text);
	font-family: var(--font-body);
	font-size: 0.88rem;
	font-weight: 600;
	cursor: pointer;
}

.cal-day:hover:not(:disabled):not(.selected) {
	background: rgba(255, 255, 255, 0.06);
}

.cal-day.empty {
	visibility: hidden;
	pointer-events: none;
}

.cal-day.today:not(.selected) {
	box-shadow: inset 0 0 0 1px rgba(212, 99, 74, 0.55);
	color: var(--realm-accent-glow);
}

.cal-day.selected {
	background: var(--realm-accent);
	color: #fff;
}

.cal-footer {
	display: flex;
	justify-content: space-between;
	gap: 0.5rem;
	margin-top: 0.75rem;
	padding-top: 0.65rem;
	border-top: 1px solid var(--realm-border);
}

.cal-today-btn,
.cal-close-btn {
	padding: 0.4rem 0.7rem;
	border-radius: 8px;
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text-muted);
	font-family: var(--font-body);
	font-size: 0.82rem;
	font-weight: 600;
	cursor: pointer;
}

.cal-today-btn:hover,
.cal-close-btn:hover {
	color: var(--realm-text);
	border-color: rgba(212, 99, 74, 0.4);
}

@media (max-width: 640px) {
	.cal-popover {
		left: 0;
		right: 0;
		top: auto;
		bottom: 0;
		transform: none;
		width: 100%;
		border-radius: 16px 16px 0 0;
		padding: 1rem 1rem calc(1rem + var(--safe-bottom, 0px));
		max-height: min(75dvh, 28rem);
		overflow-y: auto;
	}

	.cal-day {
		min-height: 2.55rem;
		font-size: 0.95rem;
	}
}
</style>
