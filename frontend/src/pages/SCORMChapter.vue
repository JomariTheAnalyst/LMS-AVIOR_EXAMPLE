<template>
	<PageHeader :breadcrumbs="breadcrumbs" />
	<div
		v-if="
			chapter.doc &&
			(enrollment.data?.length ||
				user.data?.is_moderator ||
				user.data?.is_instructor)
		"
	>
		<div
			class="sticky top-0 z-10 flex h-12 items-center justify-between gap-4 border-b bg-surface-base px-5"
		>
			<div class="min-w-0 truncate text-p-sm font-medium text-ink-gray-8">
				{{ chapter.doc?.course_title }}
				<span class="text-ink-gray-4">/</span>
				{{ chapter.doc?.title }}
			</div>
			<Button
				variant="subtle"
				size="sm"
				:label="__('Back to course')"
				@click="goToCourse()"
			/>
		</div>
		<SCORMPlayer
			:launch-file="chapter.doc.launch_file"
			:course-name="props.courseName"
			:lesson-name="chapter.doc.lessons[0].lesson"
			:chapter-name="chapter.doc.name"
			class="h-[calc(100vh-6rem)]"
			@complete="onComplete"
		/>
	</div>
	<div v-else-if="!enrollment.data?.length">
		<div class="text-center pt-10 px-5 md:px-0 pb-10">
			<div class="text-center">
				<div class="mb-4">
					{{
						__(
							'You are not enrolled in this course. Please enroll to access this lesson.'
						)
					}}
				</div>
				<Button variant="solid" @click="enrollStudent()">
					{{ __('Start Learning') }}
				</Button>
			</div>
		</div>
	</div>

	<Dialog v-model:open="showCompletionModal" :title="modalTitle" :actions="modalActions">
		<template #default>
			<p class="text-p-base text-ink-gray-7">{{ modalMessage }}</p>
		</template>
	</Dialog>
</template>
<script setup>
import {
	Button,
	Dialog,
	createDocumentResource,
	createListResource,
	usePageMeta,
} from 'frappe-ui'
import { computed, inject, onBeforeMount, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/Layouts/PageHeader.vue'
import SCORMPlayer from '@/components/SCORMPlayer.vue'
import { useSidebar } from '@/stores/sidebar'
import { sessionStore } from '../stores/session'

const { brand } = sessionStore()
const sidebarStore = useSidebar()
const user = inject('$user')
const router = useRouter()

const props = defineProps({
	courseName: {
		type: String,
		required: true,
	},
	chapterName: {
		type: String,
		required: true,
	},
})

onBeforeMount(() => {
	sidebarStore.isSidebarCollapsed = true
})

const chapter = createDocumentResource({
	doctype: 'Course Chapter',
	name: props.chapterName,
	auto: true,
	cache: ['chapter', props.chapterName],
})

const enrollment = createListResource({
	doctype: 'LMS Enrollment',
	fields: ['member', 'course'],
	filters: {
		course: props.courseName,
		member: user.data?.name,
	},
	auto: true,
	cache: ['enrollments', props.courseName, user.data?.name],
})

const enrollStudent = () => {
	enrollment.insert.submit(
		{
			course: props.courseName,
			member: user.data?.name,
		},
		{
			onSuccess(data) {
				window.location.reload()
			},
		}
	)
}

const goToCourse = () => {
	router.push({ name: 'CourseDetail', params: { courseName: props.courseName } })
}

// Set by the `complete` event from SCORMPlayer (get_lesson_completion_state's shape):
// { is_complete, lesson_title, next_lesson: { name, title, chapter_index, lesson_index } | null, course_complete }
const showCompletionModal = ref(false)
const completionState = ref(null)

const resetCompletionModal = () => {
	showCompletionModal.value = false
	completionState.value = null
}

// SCORMChapter is reused by Vue Router across chapters (same route, only the
// chapterName param changes: Vue Router does not remount on a param-only
// navigation). A modal left open for the previous chapter would otherwise keep
// floating over the next one's content unless explicitly cleared here. `chapter`
// itself needs the same treatment: createDocumentResource captures `name` once at
// creation and never refetches on its own, so without this, chapter.doc - and the
// lessonName it feeds to SCORMPlayer - would stay pinned to the first chapter ever
// opened in this component instance.
watch(
	() => props.chapterName,
	(name) => {
		resetCompletionModal()
		chapter.name = name
		chapter.reload()
	}
)
onBeforeUnmount(resetCompletionModal)

const onComplete = (state) => {
	if (!state) return
	if (state.course_complete || state.next_lesson) {
		completionState.value = state
		showCompletionModal.value = true
	}
}

const modalTitle = computed(() =>
	completionState.value?.course_complete
		? __('Course complete')
		: __('Lesson complete')
)

const modalMessage = computed(() => {
	const lessonTitle = completionState.value?.lesson_title || chapter.doc?.title || ''
	if (completionState.value?.course_complete) {
		return __('Congratulations! You have completed the course.')
	}
	if (completionState.value?.next_lesson) {
		return __('{0} is complete. Next up: {1}.').format(
			lessonTitle,
			completionState.value.next_lesson.title
		)
	}
	return ''
})

const modalActions = computed(() => {
	if (completionState.value?.course_complete) {
		return [
			{
				label: __('Close'),
				onClick: ({ close }) => close(),
			},
			{
				label: __('Back to course'),
				variant: 'solid',
				onClick: ({ close }) => {
					close()
					goToCourse()
				},
			},
		]
	}

	if (completionState.value?.next_lesson) {
		const nextLesson = completionState.value.next_lesson
		return [
			{
				label: __('Back to course'),
				onClick: ({ close }) => {
					close()
					goToCourse()
				},
			},
			{
				label: __('Next lesson'),
				variant: 'solid',
				onClick: ({ close }) => {
					close()
					router.push({
						name: 'Lesson',
						params: {
							courseName: props.courseName,
							chapterNumber: nextLesson.chapter_index,
							lessonNumber: nextLesson.lesson_index,
						},
					})
				},
			},
		]
	}

	return []
})

const breadcrumbs = computed(() => {
	return [
		{
			label: __('Courses'),
			route: { name: 'Courses' },
		},
		{
			label: chapter.doc?.course_title,
			route: { name: 'CourseDetail', params: { courseName: props.courseName } },
		},
		{
			label: chapter.doc?.title,
		},
	]
})

usePageMeta(() => {
	return {
		title: chapter.doc?.title,
		icon: brand.favicon,
	}
})
</script>
