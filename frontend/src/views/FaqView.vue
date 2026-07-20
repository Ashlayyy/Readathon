<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../lib/api';
import { useAuth } from '../composables/useAuth';
import { useConfig } from '../composables/useConfig';
import { useCopy } from '../composables/useCopy';
import { useBodyScrollLock } from '../composables/useBodyScrollLock';
import { useFocusTrap } from '../composables/useFocusTrap';

const { config, loadConfig } = useConfig();
const { user } = useAuth();
const { t } = useCopy();

const openIndices = ref<Set<number>>(new Set([0]));
const search = ref('');
const showModal = ref(false);
const questionText = ref('');
const sending = ref(false);
const sent = ref(false);
const error = ref('');
const modalRef = ref<HTMLElement | null>(null);

useBodyScrollLock(showModal);
useFocusTrap(showModal, modalRef);

onMounted(loadConfig);

const faqItems = computed(() =>
	(config.value?.faq ?? []).map((item, i) => ({
		index: i,
		q: t(item.q),
		a: t(item.a),
	})),
);

const isSearching = computed(() => search.value.trim().length > 0);

const filteredItems = computed(() => {
	const q = search.value.trim().toLowerCase();
	if (!q) return faqItems.value;
	return faqItems.value.filter(
		(item) =>
			item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q),
	);
});

function isOpen(index: number) {
	// While searching, auto-expand every match so answers are visible at a glance.
	if (isSearching.value) return true;
	return openIndices.value.has(index);
}

function toggle(i: number) {
	const next = new Set(openIndices.value);
	if (next.has(i)) next.delete(i);
	else next.add(i);
	openIndices.value = next;
}

function openAsk() {
	if (!user.value) return;
	showModal.value = true;
	sent.value = false;
	error.value = '';
	questionText.value = '';
}

function closeModal() {
	showModal.value = false;
}

async function submitQuestion() {
	error.value = '';
	sending.value = true;
	try {
		await api('/questions', {
			method: 'POST',
			body: JSON.stringify({ message: questionText.value }),
		});
		sent.value = true;
		questionText.value = '';
	} catch (e) {
		error.value = e instanceof Error ? e.message : 'Failed to send';
	} finally {
		sending.value = false;
	}
}
</script>

<template>
	<main v-if="config" class="page">
		<header class="page-header">
			<div>
				<h1 class="page-title">{{ config.copy.faqPageTitle }}</h1>
				<p class="page-lead">{{ config.copy.faqPageLead }}</p>
			</div>
		</header>

		<input
			v-model="search"
			type="search"
			class="faq-search"
			:placeholder="String(config.copy.faqSearchPlaceholder ?? 'Search questions…')"
			aria-label="Search FAQ"
		/>

		<div v-if="filteredItems.length === 0" class="faq-empty card">
			{{ config.copy.faqSearchEmpty ?? 'No questions match your search.' }}
		</div>

		<div v-else class="faq-list">
			<div
				v-for="item in filteredItems"
				:key="item.index"
				class="faq-item card"
			>
				<button type="button" class="faq-q" @click="toggle(item.index)">
					<span class="faq-q-text">{{ item.q }}</span>
					<span class="faq-toggle" aria-hidden="true">{{
						isOpen(item.index) ? '−' : '+'
					}}</span>
				</button>
				<p v-if="isOpen(item.index)" class="faq-a">{{ item.a }}</p>
			</div>
		</div>

		<section class="ask-cta card">
			<div class="ask-cta-content">
				<h2>{{ config.copy.faqAskTitle }}</h2>
				<p>{{ config.copy.faqAskBody }}</p>
			</div>
			<div class="ask-cta-actions">
				<button
					v-if="user"
					type="button"
					class="btn btn-primary"
					@click="openAsk"
				>
					{{ config.copy.faqAskButton }}
				</button>
				<RouterLink v-else to="/login" class="btn btn-primary">
					{{ config.copy.faqLoginToAsk }}
				</RouterLink>
			</div>
		</section>
	</main>

	<Teleport to="body">
		<div v-if="showModal" class="modal-backdrop" @keydown.esc="closeModal">
			<div
				ref="modalRef"
				class="modal card"
				role="dialog"
				aria-modal="true"
				aria-labelledby="ask-title"
				tabindex="-1"
			>
				<header class="modal-header">
					<h2 id="ask-title">
						{{ config?.copy.faqModalTitle ?? 'Ask the Admins' }}
					</h2>
				</header>

				<div v-if="sent" class="modal-body">
					<div class="alert alert-success">
						Your message was sent! Check
						<RouterLink to="/profile?tab=questions">your profile</RouterLink>
						for replies.
					</div>
					<button
						type="button"
						class="btn btn-primary full"
						@click="closeModal"
					>
						{{ config?.copy.faqModalDone ?? 'Done' }}
					</button>
				</div>

				<form v-else class="modal-body" @submit.prevent="submitQuestion">
					<p class="modal-hint">
						{{
							config?.copy.faqModalHint ??
							"Send one message with your question. We'll see it in our inbox."
						}}
					</p>
					<div v-if="error" class="alert alert-error">{{ error }}</div>
					<label class="field">
						Your question
						<textarea
							v-model="questionText"
							rows="5"
							:placeholder="
								String(
									config?.copy.faqModalPlaceholder ??
										'What would you like to know?',
								)
							"
							required
							minlength="10"
							maxlength="2000"
						/>
					</label>
					<p class="char-count">{{ questionText.length }} / 2000</p>
					<div class="modal-actions">
						<button type="button" class="btn btn-ghost" @click="closeModal">
							{{ config?.copy.faqModalCancel ?? 'Cancel' }}
						</button>
						<button
							type="submit"
							class="btn btn-primary"
							:disabled="sending || questionText.trim().length < 10"
						>
							{{
								sending
									? (config?.copy.loginWaiting ?? 'Sending…')
									: (config?.copy.faqModalSend ?? 'Send Message')
							}}
						</button>
					</div>
				</form>
			</div>
		</div>
	</Teleport>
</template>

<style scoped>
.page-header {
	margin-bottom: 0.5rem;
}

.faq-search {
	margin-bottom: 1.25rem;
}

.faq-empty {
	text-align: center;
	color: var(--realm-text-muted);
	margin-bottom: 2rem;
}

.faq-list {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	margin-bottom: 2rem;
}

.faq-item {
	padding: 1.1rem 1.35rem;
}

.faq-q {
	width: 100%;
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 1.25rem;
	background: none;
	border: none;
	color: var(--realm-text);
	font-weight: 600;
	font-size: 1rem;
	text-align: left;
	cursor: pointer;
	padding: 0;
	font-family: var(--font-body);
}

.faq-q-text {
	flex: 1;
	line-height: 1.5;
}

.faq-toggle {
	flex-shrink: 0;
	width: 1.5rem;
	height: 1.5rem;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--realm-accent-glow);
	font-size: 1.25rem;
	font-weight: 400;
}

.faq-a {
	margin-top: 0.85rem;
	padding-top: 0.85rem;
	border-top: 1px solid var(--realm-border);
	color: var(--realm-text-muted);
	line-height: 1.7;
}

.ask-cta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 1.25rem;
	background: linear-gradient(
		135deg,
		var(--realm-surface) 0%,
		rgba(212, 99, 74, 0.06) 100%
	);
	border-color: rgba(212, 99, 74, 0.25);
}

.ask-cta h2 {
	font-family: var(--font-display);
	color: var(--realm-text);
	font-size: 1.15rem;
	margin-bottom: 0.35rem;
}

.ask-cta p {
	color: var(--realm-text-muted);
	font-size: 0.95rem;
	margin: 0;
}

.ask-cta-actions {
	flex-shrink: 0;
}

.modal-backdrop {
	/* layout from main.css; keep local padding tweaks only */
	padding: 1.5rem;
	overflow: hidden;
}

.modal {
	width: 100%;
	max-width: 32rem;
	padding: 0;
}

.modal-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 1.25rem 1.35rem;
	border-bottom: 1px solid var(--realm-border);
}

.modal-header h2 {
	font-family: var(--font-display);
	color: var(--realm-text);
	font-size: 1.1rem;
	margin: 0;
}

.modal-body {
	padding: 1.35rem;
}

.modal-hint {
	color: var(--realm-text-muted);
	font-size: 0.9rem;
	margin-bottom: 1rem;
	line-height: 1.6;
}

.char-count {
	text-align: right;
	font-size: 0.8rem;
	color: var(--realm-text-muted);
	margin-top: 0.35rem;
}

.modal-actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.75rem;
	margin-top: 1.25rem;
}

.full {
	width: 100%;
}

@media (max-width: 768px) {
	.faq-q {
		font-size: 0.95rem;
		min-height: 2.75rem;
	}

	.ask-cta {
		flex-direction: column;
		align-items: stretch;
		text-align: center;
	}

	.ask-cta-actions {
		width: 100%;
	}

	.ask-cta-actions .btn {
		width: 100%;
	}

	.modal-backdrop {
		padding: 0;
		align-items: flex-end;
	}

	.modal {
		max-height: 92vh;
		overflow-y: auto;
		border-radius: 12px 12px 0 0;
		max-width: 100%;
	}

	.modal-actions {
		flex-direction: column-reverse;
	}

	.modal-actions .btn {
		width: 100%;
		justify-content: center;
	}
}
</style>
