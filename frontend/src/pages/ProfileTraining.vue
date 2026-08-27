<template>
	<div v-if="isOwnProfile" class="space-y-10 pb-10">
		<section
			v-for="section in sections"
			:key="section.status"
			:data-testid="`training-${section.status}`"
			:aria-labelledby="`training-${section.status}-heading`"
		>
			<div class="mb-4 flex items-center justify-between gap-4">
				<h2
					:id="`training-${section.status}-heading`"
					class="text-lg font-semibold text-ink-gray-9"
				>
					{{ section.label }}
				</h2>
				<span
					v-if="section.items.length"
					class="text-sm text-ink-gray-6"
				>
					{{ section.items.length }}
				</span>
			</div>

			<SkeletonLoader
				v-if="section.loading && !section.items.length"
				variant="cards"
				:count="2"
			/>

			<div v-else-if="section.items.length" class="space-y-3">
				<router-link
					v-for="course in section.items"
					:key="course.enrollment"
					:to="courseRoute(course)"
					class="group block rounded-lg border border-outline-gray-2 bg-surface-base p-3 transition-colors hover:border-outline-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-3 sm:p-4"
				>
					<article class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
						<img
							v-if="course.image"
							:src="safeUrl(course.image)"
							:alt="course.title"
							width="320"
							height="180"
							class="aspect-video w-full shrink-0 rounded-md object-cover sm:h-28 sm:w-40"
						/>
						<div
							v-else
							class="flex aspect-video w-full shrink-0 items-center justify-center rounded-md bg-surface-gray-2 text-ink-gray-5 sm:h-28 sm:w-40"
							aria-hidden="true"
						>
							<span class="lucide-book-open size-6" />
						</div>

						<div class="min-w-0 flex-1">
							<div class="flex min-w-0 items-start justify-between gap-3">
								<h3
									class="min-w-0 text-base font-semibold leading-6 text-ink-gray-9 group-hover:text-ink-blue-6"
								>
									{{ course.title }}
								</h3>
								<span
									class="shrink-0 rounded-full bg-surface-gray-2 px-2 py-1 text-xs font-medium text-ink-gray-7"
								>
									{{ statusLabel(course.progress) }}
								</span>
							</div>

							<div class="mt-4 flex items-center gap-3">
								<ProgressBar
									:progress="progressValue(course.progress)"
									size="md"
									class="min-w-0 flex-1"
								/>
								<span class="w-11 shrink-0 text-end text-sm text-ink-gray-7">
									{{ progressValue(course.progress) }}%
								</span>
							</div>

							<div
								class="mt-4 flex min-h-10 items-center justify-center gap-2 rounded-md bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-8 group-hover:bg-surface-gray-3 sm:ms-auto sm:min-h-0 sm:w-fit sm:justify-start sm:bg-transparent sm:p-0"
							>
								{{ course.progress >= 100 ? __('View Course') : __('Continue') }}
								<span class="lucide-arrow-right size-4 rtl:rotate-180" />
							</div>
						</div>
					</article>
				</router-link>
			</div>

			<div
				v-else
				class="rounded-lg border border-dashed border-outline-gray-2 px-4 py-10 text-center text-sm text-ink-gray-6"
			>
				{{ section.emptyMessage }}
			</div>

			<div v-if="section.hasMore" class="mt-4 flex justify-center">
				<Button
					:label="__('Load More')"
					:loading="section.loading"
					variant="subtle"
					@click="loadSection(section)"
				/>
			</div>
		</section>
	</div>
</template>

<script setup>
import { Button, call, toast } from 'frappe-ui'
import { computed, inject, reactive, watch } from 'vue'
import ProgressBar from '@/components/ProgressBar.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import { safeUrl } from '@/utils/safeUrl'

const PAGE_SIZE = 20
const $user = inject('$user')

const props = defineProps({
	profile: {
		type: Object,
		required: true,
	},
})

const sections = reactive([
	{
		status: 'active',
		label: __('Active / In Progress'),
		emptyMessage: __("You don't have any active courses right now."),
		items: [],
		offset: 0,
		hasMore: false,
		loading: false,
	},
	{
		status: 'completed',
		label: __('Completed'),
		emptyMessage: __('No completed courses yet.'),
		items: [],
		offset: 0,
		hasMore: false,
		loading: false,
	},
])

const isOwnProfile = computed(
	() =>
		Boolean(props.profile.data?.name) &&
		props.profile.data.name === $user.data?.name
)

const progressValue = (progress) => Math.max(0, Math.round(Number(progress) || 0))

const statusLabel = (progress) => {
	const value = progressValue(progress)
	if (value >= 100) return __('Completed')
	if (value > 0) return __('In Progress')
	return __('Enrolled')
}

const courseRoute = (course) => ({
	name: 'CourseDetail',
	params: { courseName: course.name },
})

const resetSections = () => {
	sections.forEach((section) => {
		section.items = []
		section.offset = 0
		section.hasMore = false
		section.loading = false
	})
}

const loadSection = async (section, showError = true) => {
	if (!isOwnProfile.value || section.loading) return true

	section.loading = true
	try {
		const response = await call('avior.api.get_user_training', {
			target_user: props.profile.data.name,
			status: section.status,
			offset: section.offset,
			limit: PAGE_SIZE,
		})
		section.items.push(...response.items)
		section.hasMore = response.has_more
		section.offset = response.next_offset ?? section.offset + response.items.length
		return true
	} catch {
		if (showError) {
			toast.error(__('Unable to load training records. Please try again.'))
		}
		return false
	} finally {
		section.loading = false
	}
}

const loadTraining = async () => {
	resetSections()
	if (!isOwnProfile.value) return

	const results = await Promise.all(
		sections.map((section) => loadSection(section, false))
	)
	if (results.some((loaded) => !loaded)) {
		toast.error(__('Unable to load training records. Please try again.'))
	}
}

watch(
	() => [props.profile.data?.name, $user.data?.name],
	loadTraining,
	{ immediate: true }
)
</script>
