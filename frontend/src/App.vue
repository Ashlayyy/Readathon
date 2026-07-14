<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { api } from './lib/api';
import { useAuth } from './composables/useAuth';
import { useConfig } from './composables/useConfig';
import { useAdminCopy } from './composables/useAdminCopy';
import { closeAllNavDropdowns } from './composables/useNavDropdown';
import SiteNavDropdown from './components/SiteNavDropdown.vue';
import { APP_VERSION } from './lib/version';

const { user, logout } = useAuth();
const { config, configLoading, configError, loadConfig } = useConfig();
const { admin } = useAdminCopy();
const route = useRoute();
const router = useRouter();
const unreadQuestions = ref(0);
const menuOpen = ref(false);
let unreadPromise: Promise<void> | null = null;

const isMaintenancePage = computed(() => route.name === 'maintenance');
const downtimeActive = computed(() => config.value?.site?.downtimeMode === true);

const nav = computed(() => config.value?.copy.nav ?? {});

const playNavItems = computed(() => [
	{ to: '/prompts', label: nav.value.prompts ?? 'Prompts' },
	{ to: '/standings', label: nav.value.standings ?? 'Standings' },
	{
		to: '/submit',
		label: String(config.value?.copy.submitNav ?? 'Submit'),
		show: user.value?.status === 'assigned',
	},
]);

const aboutNavItems = computed(() => [
	{ to: '/how-it-works', label: nav.value.howItWorks ?? 'Rules' },
	{ to: '/teams', label: nav.value.teams ?? 'Teams' },
	{ to: '/faq', label: nav.value.faq ?? 'FAQ' },
]);

watch(
	() => user.value?.isAdmin,
	async (isAdmin) => {
		if (isAdmin) await loadUnreadCount();
		else unreadQuestions.value = 0;
	},
	{ immediate: true },
);

watch(
	() => route.path,
	(path) => {
		menuOpen.value = false;
		closeAllNavDropdowns();
		if (user.value?.isAdmin && path.startsWith('/admin')) {
			loadUnreadCount();
		}
	},
);

watch(config, (c) => {
	if (c) document.title = `${c.event.name} — ${c.event.subtitle}`;
});

async function loadUnreadCount() {
	if (!user.value?.isAdmin) return;
	if (unreadPromise) return unreadPromise;

	unreadPromise = (async () => {
		try {
			const data = await api<{ unread: number }>(
				'/admin/questions/unread-count',
			);
			unreadQuestions.value = data.unread;
		} catch {
			unreadQuestions.value = 0;
		} finally {
			unreadPromise = null;
		}
	})();

	return unreadPromise;
}

async function handleLogout() {
	await logout();
	menuOpen.value = false;
	await router.push('/');
}

function closeMenu() {
	menuOpen.value = false;
}
</script>

<template>
	<div class="app-shell">
		<header v-if="!isMaintenancePage" class="site-header">
			<div class="header-inner">
				<div class="header-top">
					<RouterLink to="/" class="brand" @click="closeMenu">
						<span class="brand-icon">⚔</span>
						<span v-if="config" class="brand-text">{{
							config.event.name
						}}</span>
						<span v-else class="brand-text">Readathon 2026</span>
					</RouterLink>

					<button
						type="button"
						class="menu-toggle"
						:aria-expanded="menuOpen"
						aria-controls="main-navigation"
						@click="menuOpen = !menuOpen"
					>
						<span class="sr-only">{{
							menuOpen ? 'Close menu' : 'Open menu'
						}}</span>
						<span class="menu-bar" :class="{ open: menuOpen }" />
					</button>
				</div>

				<nav
					id="main-navigation"
					class="main-nav"
					:class="{ open: menuOpen }"
					aria-label="Main"
				>
					<RouterLink to="/" class="nav-home" @click="closeMenu">{{
						nav.home ?? 'Home'
					}}</RouterLink>

					<div class="nav-desktop-groups">
						<SiteNavDropdown
							id="nav-play"
							:label="nav.playGroup ?? 'Play'"
							:items="playNavItems"
							@navigate="closeMenu"
						/>
						<SiteNavDropdown
							id="nav-about"
							:label="nav.aboutGroup ?? 'About'"
							:items="aboutNavItems"
							@navigate="closeMenu"
						/>
					</div>

					<div class="nav-mobile-groups">
						<SiteNavDropdown
							id="nav-play-mobile"
							mobile
							:label="nav.playGroup ?? 'Play'"
							:items="playNavItems"
							@navigate="closeMenu"
						/>
						<SiteNavDropdown
							id="nav-about-mobile"
							mobile
							:label="nav.aboutGroup ?? 'About'"
							:items="aboutNavItems"
							@navigate="closeMenu"
						/>
					</div>
				</nav>

				<div class="header-actions" :class="{ open: menuOpen }">
					<div v-if="user?.isAdmin" class="action-buttons">
						<RouterLink
							to="/admin"
							class="btn btn-secondary btn-sm action-btn"
							@click="closeMenu"
						>
							{{ (admin?.nav as string) ?? 'Admin' }}
							<span v-if="unreadQuestions > 0" class="inbox-badge">{{
								unreadQuestions
							}}</span>
						</RouterLink>
					</div>

					<template v-if="user">
						<RouterLink
							to="/profile"
							class="btn btn-secondary btn-sm profile-btn profile-btn-compact"
							:title="user.displayName"
							@click="closeMenu"
						>
							<span class="profile-avatar">
								{{ user.displayName.charAt(0).toUpperCase() }}
								<span v-if="user.unreadAnswers" class="avatar-badge">{{
									user.unreadAnswers
								}}</span>
							</span>
							<span class="profile-text profile-text-menu">
								<span class="profile-name">
									{{ user.displayName }}
									<span v-if="user.unreadAnswers" class="profile-badge">{{
										user.unreadAnswers
									}}</span>
								</span>
								<span class="profile-email">{{ user.email }}</span>
							</span>
						</RouterLink>
						<button
							type="button"
							class="btn btn-ghost btn-sm logout-btn"
							@click="handleLogout"
						>
							{{ config?.copy.logoutCta ?? 'Log out' }}
						</button>
					</template>
					<RouterLink
						v-else
						to="/login"
						class="btn btn-primary btn-sm join-btn"
						@click="closeMenu"
					>
						{{ config?.copy.joinCta ?? 'Join' }}
					</RouterLink>
				</div>
			</div>
		</header>

		<div v-if="menuOpen" class="menu-backdrop" @click="closeMenu" />

		<div class="app-content">
			<div
				v-if="downtimeActive && user?.isAdmin && !isMaintenancePage"
				class="alert alert-warning status-banner"
			>
				<strong>Downtime mode is on.</strong>
				Only admins can use the site. Turn it off in Admin → Teams when you're done.
			</div>

			<div
				v-if="user?.status === 'pending' && config"
				class="alert alert-warning status-banner"
			>
				<strong>Awaiting assignment.</strong> {{ config.copy.pendingBanner }}
			</div>

			<div v-if="configLoading && !config" class="page-state">
				<div class="page-spinner" role="status" aria-label="Loading" />
				<p>Loading event…</p>
			</div>

			<div v-else-if="configError && !config" class="page-state">
				<div class="alert alert-error">
					{{ configError }}
				</div>
				<button type="button" class="btn btn-primary" @click="loadConfig(true)">
					Try again
				</button>
			</div>

			<RouterView v-else />
		</div>

		<footer v-if="config && !isMaintenancePage" class="site-footer">
			<p>
				{{ config.event.name }} — <em>{{ config.event.subtitle }}</em>
			</p>
			<p class="app-version">v{{ APP_VERSION }}</p>
		</footer>
	</div>
</template>

<style scoped>
.app-shell {
	min-height: 100vh;
	display: flex;
	flex-direction: column;
}

.site-header {
	border-bottom: 1px solid var(--realm-border);
	background: rgba(8, 7, 11, 0.92);
	backdrop-filter: blur(8px);
	position: sticky;
	top: 0;
	z-index: 200;
	margin: 0 calc(-1 * var(--page-gutter) - var(--safe-left)) 1.5rem;
	margin-right: calc(-1 * var(--page-gutter) - var(--safe-right));
	padding: var(--safe-top) calc(var(--page-gutter) + var(--safe-right)) 0
		calc(var(--page-gutter) + var(--safe-left));
}

.header-inner {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
	align-items: center;
	gap: 0.75rem 1.25rem;
	padding: 0.75rem 0;
	max-width: var(--page-max);
	margin: 0 auto;
}

.header-top {
	display: contents;
}

.brand {
	grid-column: 1;
	justify-self: start;
	display: flex;
	align-items: center;
	gap: 0.6rem;
	color: var(--realm-text);
	white-space: nowrap;
}

.brand-icon {
	font-size: 1.5rem;
	color: var(--realm-accent);
}

.brand-text {
	font-family: var(--font-display);
	font-size: clamp(0.95rem, 3.5vw, 1.15rem);
	font-weight: 700;
	letter-spacing: 0.08em;
}

.brand-text em {
	font-style: normal;
	color: var(--realm-accent-glow);
	font-size: 0.85em;
}

.menu-toggle {
	display: none;
	align-items: center;
	justify-content: center;
	width: 2.75rem;
	height: 2.75rem;
	padding: 0;
	border: 1px solid var(--realm-border);
	border-radius: var(--radius);
	background: var(--realm-surface);
	cursor: pointer;
	flex-shrink: 0;
}

.menu-bar,
.menu-bar::before,
.menu-bar::after {
	display: block;
	width: 1.15rem;
	height: 2px;
	background: var(--realm-text);
	border-radius: 1px;
	transition:
		transform 0.2s,
		opacity 0.2s;
}

.menu-bar {
	position: relative;
}

.menu-bar::before,
.menu-bar::after {
	content: '';
	position: absolute;
	left: 0;
}

.menu-bar::before {
	top: -6px;
}

.menu-bar::after {
	top: 6px;
}

.menu-bar.open {
	background: transparent;
}

.menu-bar.open::before {
	top: 0;
	transform: rotate(45deg);
}

.menu-bar.open::after {
	top: 0;
	transform: rotate(-45deg);
}

.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	border: 0;
}

.main-nav {
	grid-column: 2;
	display: flex;
	flex-wrap: nowrap;
	align-items: center;
	gap: 0.15rem 1rem;
	justify-content: center;
	justify-self: center;
}

.nav-desktop-groups {
	display: flex;
	align-items: center;
	gap: 0.15rem 1rem;
	position: relative;
	z-index: 1;
}

.nav-mobile-groups {
	display: none;
}

.main-nav :deep(.nav-home),
.main-nav > :deep(a.nav-home) {
	color: var(--realm-text-muted);
	font-size: 0.88rem;
	font-weight: 500;
	padding: 0.45rem 0;
	min-height: 2.5rem;
	display: inline-flex;
	align-items: center;
	border-bottom: 2px solid transparent;
	transition:
		color 0.2s,
		border-color 0.2s;
	white-space: nowrap;
	text-decoration: none;
}

.main-nav :deep(.nav-home:hover),
.main-nav :deep(.nav-home.router-link-active),
.main-nav :deep(.nav-home.router-link-exact-active) {
	color: var(--realm-accent-glow);
	border-bottom-color: var(--realm-accent);
}

.main-nav a {
	color: var(--realm-text-muted);
	font-size: 0.88rem;
	font-weight: 500;
	padding: 0.45rem 0;
	min-height: 2.5rem;
	display: inline-flex;
	align-items: center;
	border-bottom: 2px solid transparent;
	transition:
		color 0.2s,
		border-color 0.2s;
	white-space: nowrap;
}

.main-nav a:hover,
.main-nav a.router-link-active,
.main-nav a.router-link-exact-active {
	color: var(--realm-accent-glow);
	border-bottom-color: var(--realm-accent);
}

.header-actions {
	grid-column: 3;
	display: flex;
	align-items: center;
	justify-content: flex-end;
	justify-self: end;
	gap: 0.65rem;
	min-width: 0;
	position: relative;
	z-index: 0;
}

.action-buttons {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding-right: 0.5rem;
	border-right: 1px solid var(--realm-border);
}

.action-buttons:empty {
	display: none;
	padding: 0;
	border: none;
}

.action-buttons :deep(a.action-btn) {
	position: relative;
	text-decoration: none;
	min-height: 2.75rem;
}

.action-buttons :deep(a.action-btn:hover),
.action-buttons :deep(a.action-btn.router-link-active),
.action-buttons :deep(a.action-btn.router-link-exact-active) {
	color: var(--realm-accent-glow);
	border-color: var(--realm-accent);
	background: rgba(212, 99, 74, 0.1);
}

.profile-btn {
	display: inline-flex;
	align-items: center;
	gap: 0.65rem;
	text-align: left;
	text-decoration: none;
	min-height: 2.5rem;
	padding: 0.35rem 0.75rem 0.35rem 0.35rem;
}

.profile-btn-compact {
	max-width: none;
	padding: 0.2rem;
}

.profile-text-menu {
	display: none;
}

.profile-btn:hover,
.profile-btn.router-link-active,
.profile-btn.router-link-exact-active {
	color: var(--realm-accent-glow);
	border-color: var(--realm-accent);
	background: rgba(212, 99, 74, 0.1);
}

.profile-avatar {
	flex-shrink: 0;
	width: 2rem;
	height: 2rem;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, var(--realm-accent), #a84030);
	color: white;
	font-family: var(--font-display);
	font-size: 0.9rem;
	font-weight: 700;
	position: relative;
}

.avatar-badge {
	position: absolute;
	top: -0.2rem;
	right: -0.2rem;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 1rem;
	height: 1rem;
	padding: 0 0.25rem;
	border-radius: 999px;
	background: var(--realm-success);
	color: #0a1a0f;
	font-size: 0.6rem;
	font-weight: 700;
	border: 2px solid var(--realm-surface);
}

.profile-text {
	display: flex;
	flex-direction: column;
	line-height: 1.25;
	min-width: 0;
}

.profile-name {
	font-size: 0.85rem;
	font-weight: 600;
	color: var(--realm-text);
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.profile-email {
	font-size: 0.72rem;
	color: var(--realm-text-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.inbox-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 1.15rem;
	height: 1.15rem;
	padding: 0 0.3rem;
	margin-left: 0.15rem;
	border-radius: 999px;
	background: var(--realm-accent);
	color: white;
	font-size: 0.65rem;
	font-weight: 700;
}

.profile-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 1.1rem;
	height: 1.1rem;
	padding: 0 0.3rem;
	border-radius: 999px;
	background: var(--realm-success);
	color: #0a1a0f;
	font-size: 0.65rem;
	font-weight: 700;
}

.btn-sm {
	padding: 0.45rem 0.8rem;
	font-size: 0.82rem;
	min-height: 2.5rem;
}

.menu-backdrop {
	display: none;
}

.app-content {
	flex: 1;
	min-width: 0;
}

.status-banner {
	margin-bottom: 1.25rem;
}

.site-footer {
	margin-top: 2rem;
	padding-top: 1.5rem;
	text-align: center;
	color: var(--realm-text-muted);
	font-size: 0.85rem;
	opacity: 0.65;
}

.site-footer em {
	color: var(--realm-accent);
	font-style: normal;
}

.app-version {
	margin-top: 0.35rem;
	font-size: 0.75rem;
	opacity: 0.85;
	font-family: ui-monospace, monospace;
}

/* Tablet */
@media (max-width: 1024px) {
	.header-inner {
		grid-template-columns: 1fr auto;
		grid-template-rows: auto auto;
	}

	.brand {
		grid-column: 1;
		grid-row: 1;
	}

	.header-actions {
		grid-column: 2;
		grid-row: 1;
	}

	.main-nav {
		grid-column: 1 / -1;
		grid-row: 2;
		width: 100%;
		justify-content: flex-start;
		flex-wrap: wrap;
		gap: 0.15rem 0.85rem;
	}
}

@media (max-width: 900px) {
	.action-buttons {
		border-right: none;
		padding-right: 0;
	}
}

/* Mobile */
@media (max-width: 768px) {
	.site-header {
		margin-bottom: 1rem;
	}

	.header-inner {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0;
		padding: 0.65rem 0;
	}

	.header-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		margin-bottom: 0;
	}

	.brand {
		grid-column: unset;
		justify-self: unset;
	}

	.main-nav {
		grid-column: unset;
		grid-row: unset;
		justify-self: unset;
	}

	.header-actions {
		grid-column: unset;
		grid-row: unset;
		justify-self: unset;
		justify-content: stretch;
	}

	.menu-toggle {
		display: flex;
	}

	.menu-backdrop {
		display: block;
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 150;
	}

	.main-nav {
		display: none;
		flex-direction: column;
		gap: 0;
		width: 100%;
		padding: 0.5rem 0;
		border-top: 1px solid var(--realm-border);
		margin-top: 0.65rem;
	}

	.main-nav.open {
		display: flex;
	}

	.nav-desktop-groups {
		display: none;
	}

	.nav-mobile-groups {
		display: flex;
		flex-direction: column;
		width: 100%;
	}

	.main-nav :deep(.nav-home) {
		padding: 0.85rem 0.5rem;
		border-bottom: 1px solid var(--realm-border);
		width: 100%;
		font-size: 1rem;
		min-height: unset;
	}

	.header-actions {
		display: none;
		flex-direction: column;
		align-items: stretch;
		gap: 0.65rem;
		width: 100%;
		padding: 0.75rem 0 0.25rem;
		border-top: 1px solid var(--realm-border);
	}

	.header-actions.open {
		display: flex;
	}

	.action-buttons {
		border-right: none;
		padding-right: 0;
		width: 100%;
		flex-wrap: wrap;
	}

	.action-buttons :deep(a.action-btn) {
		flex: 1;
		justify-content: center;
	}

	.profile-btn {
		max-width: 100%;
		width: 100%;
		padding: 0.4rem 0.85rem 0.4rem 0.45rem;
	}

	.profile-text-menu {
		display: flex;
	}

	.logout-btn {
		display: inline-flex !important;
	}

	.logout-btn,
	.join-btn {
		width: 100%;
		justify-content: center;
	}
}

@media (max-width: 768px) {
	.profile-email {
		display: none;
	}
}

@media (max-width: 400px) {
	.profile-btn {
		justify-content: flex-start;
	}
}
</style>
