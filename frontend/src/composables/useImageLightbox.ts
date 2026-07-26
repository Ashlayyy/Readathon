import { computed, ref } from 'vue'

const src = ref<string | null>(null)
const alt = ref('')

export function useImageLightbox() {
	const open = computed(() => Boolean(src.value))

	function show(imageSrc: string, imageAlt = '') {
		const trimmed = imageSrc.trim()
		if (!trimmed) return
		src.value = trimmed
		alt.value = imageAlt
	}

	function close() {
		src.value = null
		alt.value = ''
	}

	return {
		src,
		alt,
		open,
		show,
		close,
	}
}
