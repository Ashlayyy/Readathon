<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuth } from '../composables/useAuth';
import { useConfig } from '../composables/useConfig';

const { config } = useConfig();
const { user } = useAuth();

const maintenanceCopy = computed(() => {
	const raw = config.value?.copy.maintenance;
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	return raw as Record<string, string>;
});

const title = computed(() =>
	String(maintenanceCopy.value.title ?? "We'll be right back"),
);
const lead = computed(() =>
	String(
		maintenanceCopy.value.lead ??
			'The readathon site is briefly down for maintenance.',
	),
);
const body = computed(() =>
	String(
		maintenanceCopy.value.body ??
			"Please wait - the site admins know about this and we're working on it.",
	),
);
const adminNote = computed(() =>
	user.value?.isAdmin
		? String(
				maintenanceCopy.value.adminNote ??
					'You are signed in as an admin - use the link below to continue.',
			)
		: '',
);
</script>

<template>
	<main class="page maintenance-page">
		<div v-if="config" class="maintenance-card card">
			<div class="maintenance-icon" aria-hidden="true">⏳</div>
			<h1>{{ title }}</h1>
			<p class="lead">{{ lead }}</p>
			<p class="body">{{ body }}</p>

			<div v-if="adminNote" class="admin-note">
				<p>{{ adminNote }}</p>
				<RouterLink to="/admin" class="btn btn-primary">Go to admin</RouterLink>
			</div>

			<p v-else class="fine-print">
				{{
					maintenanceCopy.loginHint ?? 'Admins can sign in to manage the site.'
				}}
				<RouterLink to="/login">{{
					maintenanceCopy.loginLink ?? 'Sign in'
				}}</RouterLink>
			</p>
		</div>
	</main>
</template>

<style scoped>
.maintenance-page {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: min(70vh, 640px);
	padding: 2rem 1rem;
}

.maintenance-card {
	max-width: 32rem;
	width: 100%;
	text-align: center;
	padding: 2.5rem 2rem;
}

.maintenance-icon {
	font-size: 2.75rem;
	line-height: 1;
	margin-bottom: 1rem;
	filter: drop-shadow(0 0 12px rgba(255, 180, 80, 0.35));
}

.maintenance-card h1 {
	margin: 0 0 0.75rem;
	font-size: clamp(1.75rem, 4vw, 2.25rem);
}

.maintenance-card .lead {
	margin: 0 0 1rem;
	color: var(--text-muted);
	font-size: 1.05rem;
}

.maintenance-card .body {
	margin: 0;
	line-height: 1.6;
}

.admin-note {
	margin-top: 1.75rem;
	padding-top: 1.5rem;
	border-top: 1px solid var(--border-subtle);
}

.admin-note p {
	margin: 0 0 1rem;
	color: var(--text-muted);
	font-size: 0.95rem;
}

.fine-print {
	margin: 1.75rem 0 0;
	font-size: 0.9rem;
	color: var(--text-muted);
}

.fine-print a {
	margin-left: 0.35rem;
}
</style>
