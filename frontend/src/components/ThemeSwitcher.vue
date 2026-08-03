<script setup lang="ts">
import { ref } from 'vue'
import { useTheme, type ThemeColors, type ThemeMode } from '../composables/useTheme'

const props = defineProps<{
  /** Nav: moon/sun toggle only. Full editor lives in profile settings. */
  compact?: boolean
}>()

const {
  mode,
  customColors,
  savedCustoms,
  setMode,
  toggleDarkLight,
  setCustomColor,
  resetCustomToPreset,
  saveCustomTheme,
  deleteSavedTheme,
  loadSavedTheme,
} = useTheme()

const newThemeName = ref('')

const modes: { value: ThemeMode; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'custom', label: 'Custom' },
]

const colorFields: { key: keyof ThemeColors; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'surfaceAlt', label: 'Surface (alt)' },
  { key: 'text', label: 'Text' },
  { key: 'textMuted', label: 'Muted text' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentGlow', label: 'Accent glow' },
  { key: 'border', label: 'Border' },
  { key: 'success', label: 'Success' },
]

function onColorInput(key: keyof ThemeColors, event: Event) {
  setCustomColor(key, (event.target as HTMLInputElement).value)
}

function handleSave() {
  if (!newThemeName.value.trim()) return
  saveCustomTheme(newThemeName.value)
  newThemeName.value = ''
}
</script>

<template>
  <!-- Nav: one-tap dark ↔ light -->
  <button
    v-if="props.compact"
    type="button"
    class="theme-icon-btn"
    :aria-label="mode === 'light' ? 'Switch to dark theme' : 'Switch to light theme'"
    :title="mode === 'light' ? 'Switch to dark theme' : 'Switch to light theme'"
    @click="toggleDarkLight"
  >
    <span aria-hidden="true">{{ mode === 'light' ? '☀' : '🌙' }}</span>
  </button>

  <!-- Profile settings: full theme studio -->
  <div v-else class="theme-editor">
    <p class="theme-editor-lead">
      Pick dark or light, or build a custom palette. Saved themes stay on this device.
      When a host event theme is live and you’ve opted in, dark/light uses that event’s pair.
    </p>

    <div class="theme-mode-row" role="radiogroup" aria-label="Theme mode">
      <button
        v-for="m in modes"
        :key="m.value"
        type="button"
        class="theme-mode-btn"
        :class="{ selected: mode === m.value }"
        :aria-pressed="mode === m.value"
        @click="setMode(m.value)"
      >
        {{ m.label }}
      </button>
    </div>

    <div v-if="mode === 'custom'" class="theme-custom-panel">
      <div class="theme-color-grid">
        <label v-for="f in colorFields" :key="f.key" class="theme-color-field">
          <span>{{ f.label }}</span>
          <input
            type="color"
            :value="customColors[f.key]"
            @input="onColorInput(f.key, $event)"
          />
        </label>
      </div>

      <div class="theme-custom-actions">
        <button type="button" class="btn btn-ghost btn-sm" @click="resetCustomToPreset('dark')">
          Reset to dark
        </button>
        <button type="button" class="btn btn-ghost btn-sm" @click="resetCustomToPreset('light')">
          Reset to light
        </button>
      </div>

      <div class="theme-save-row">
        <input
          v-model="newThemeName"
          type="text"
          maxlength="40"
          placeholder="Name this theme"
          aria-label="Theme name"
        />
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="!newThemeName.trim()"
          @click="handleSave"
        >
          Save theme
        </button>
      </div>

      <ul v-if="savedCustoms.length" class="saved-theme-list">
        <li v-for="t in savedCustoms" :key="t.id" class="saved-theme-item">
          <button type="button" class="saved-theme-btn" @click="loadSavedTheme(t.id)">
            {{ t.name }}
          </button>
          <button
            type="button"
            class="saved-theme-delete"
            aria-label="Delete saved theme"
            @click="deleteSavedTheme(t.id)"
          >
            ✕
          </button>
        </li>
      </ul>
    </div>

    <p v-else class="theme-editor-hint">
      Switch to <strong>Custom</strong> to tweak colors and save named themes.
    </p>
  </div>
</template>

<style scoped>
.theme-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  border: 1px solid var(--realm-border);
  border-radius: var(--radius);
  background: var(--realm-surface);
  color: var(--realm-text);
  font-size: 1.1rem;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.theme-icon-btn:hover {
  border-color: color-mix(in srgb, var(--realm-accent) 45%, var(--realm-border));
  background: var(--realm-surface-alt);
}

.theme-editor {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.theme-editor-lead,
.theme-editor-hint {
  margin: 0;
  font-size: 0.9rem;
  color: var(--realm-text-muted);
  line-height: 1.45;
}

.theme-mode-row {
  display: flex;
  gap: 0.5rem;
}

.theme-mode-btn {
  flex: 1;
  padding: 0.55rem 0.6rem;
  border: 2px solid var(--realm-border);
  border-radius: var(--radius);
  background: var(--realm-bg);
  color: var(--realm-text-muted);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}

.theme-mode-btn:hover {
  border-color: color-mix(in srgb, var(--realm-accent) 40%, var(--realm-border));
}

.theme-mode-btn.selected {
  border-color: var(--realm-accent);
  background: color-mix(in srgb, var(--realm-accent) 14%, var(--realm-bg));
  color: var(--realm-text);
}

.theme-custom-panel {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.theme-color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
  gap: 0.6rem;
}

.theme-color-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--realm-border);
  border-radius: 8px;
  background: var(--realm-bg);
  font-size: 0.78rem;
  color: var(--realm-text-muted);
}

.theme-color-field input[type='color'] {
  width: 2rem;
  height: 1.6rem;
  padding: 0;
  border: 1px solid var(--realm-border);
  border-radius: 4px;
  background: none;
  cursor: pointer;
}

.theme-custom-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.theme-save-row {
  display: flex;
  gap: 0.5rem;
}

.theme-save-row input {
  flex: 1;
}

.saved-theme-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
}

.saved-theme-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.saved-theme-btn {
  flex: 1;
  text-align: left;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--realm-border);
  border-radius: 8px;
  background: var(--realm-bg);
  color: var(--realm-text);
  font-family: var(--font-body);
  font-size: 0.82rem;
  cursor: pointer;
}

.saved-theme-btn:hover {
  border-color: color-mix(in srgb, var(--realm-accent) 40%, var(--realm-border));
}

.saved-theme-delete {
  flex-shrink: 0;
  width: 1.9rem;
  height: 1.9rem;
  border: 1px solid var(--realm-border);
  border-radius: 8px;
  background: var(--realm-bg);
  color: var(--realm-text-muted);
  cursor: pointer;
  font-size: 0.75rem;
}

.saved-theme-delete:hover {
  color: var(--realm-accent-glow);
  border-color: color-mix(in srgb, var(--realm-accent) 40%, var(--realm-border));
}
</style>
