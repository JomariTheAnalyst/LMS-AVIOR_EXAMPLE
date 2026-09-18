<template>
	<iframe
		v-if="readyToRender"
		:src="safeUrl(launchFile)"
		:title="__('Lesson content')"
		class="w-full"
	/>
</template>
<script setup>
import { call, createResource } from 'frappe-ui'
import { inject, onBeforeMount, onBeforeUnmount, ref, watch } from 'vue'
import { safeUrl } from '@/utils/safeUrl'

const user = inject('$user')
const readyToRender = ref(false)
const isSuccessfullyCompleted = ref(false)
// Latches the `complete` emit the same way isSuccessfullyCompleted latches the save,
// so a duplicate SetValue call (or a re-fetched completion state) can't emit twice for
// the same lesson. Reset, along with isSuccessfullyCompleted, when lessonName changes.
const hasEmittedComplete = ref(false)

// If courseRestartOnFailure is true, student has to restart the whole course if failed.
// Otherwise, student could retake the final quiz portion.
// Ideally, this should be configurable along with `Number of failures before course should restart`.
const courseRestartOnFailure = false

const props = defineProps({
	launchFile: {
		type: String,
		required: true,
	},
	courseName: {
		type: String,
		required: true,
	},
	lessonName: {
		type: String,
		required: true,
	},
	chapterName: {
		type: String,
		required: true,
	},
})

const emit = defineEmits(['complete'])

onBeforeMount(() => {
	setupSCORMAPI()
})

onBeforeUnmount(() => {
	clearTimeout(saveTimeout)
})

// SCORMChapter reuses this component across lessons within the same 'SCORMChapter'
// route (Vue Router doesn't remount on a param-only navigation), so nothing here
// resets on its own. Discard (don't flush) any pending debounce: by the time this
// fires, lessonName already points at the new lesson, and saveProgress reads it live -
// flushing here would misattribute the previous lesson's suspend_data to the new one.
watch(
	() => props.lessonName,
	() => {
		clearTimeout(saveTimeout)
		saveTimeout = null
		pendingSuspendDetails = null
		isSuccessfullyCompleted.value = false
		hasEmittedComplete.value = false
		readyToRender.value = false
		progress.reload()
	}
)

const progress = createResource({
	url: 'frappe.client.get_value',
	makeParams() {
		return {
			doctype: 'LMS Course Progress',
			fieldname: ['status', 'scorm_content'],
			filters: {
				member: user.data?.name,
				lesson: props.lessonName,
				chapter: props.chapterName,
				course: props.courseName,
			},
		}
	},
	auto: true,
	onSuccess(data) {
		readyToRender.value = true
	},
})

const getDataFromLMS = (key) => {
	if (key === 'cmi.core.lesson_status') {
		return progress.data?.status === 'Complete' ? 'passed' : 'incomplete'
	} else if (key === 'cmi.launch_data') {
		return progress.data?.scorm_content || ''
	} else if (key === 'cmi.suspend_data') {
		return progress.data?.scorm_content || ''
	}
	return ''
}

let saveTimeout = null
let pendingSuspendDetails = null
const debouncedSaveProgress = (scormDetails) => {
	if (isSuccessfullyCompleted.value) return
	clearTimeout(saveTimeout)
	pendingSuspendDetails = scormDetails
	saveTimeout = setTimeout(() => {
		pendingSuspendDetails = null
		if (!isSuccessfullyCompleted.value) saveProgress(scormDetails)
	}, 300)
}

// Called from Terminate/LMSFinish so a learner who closes the tab within the 300ms
// debounce window doesn't lose their resume position: clears the pending timer and
// fires the save immediately instead of letting it evaporate with the page.
const flushPendingProgress = () => {
	if (saveTimeout === null) return
	clearTimeout(saveTimeout)
	saveTimeout = null
	const details = pendingSuspendDetails
	pendingSuspendDetails = null
	if (details && !isSuccessfullyCompleted.value) saveProgress(details)
}

const saveDataToLMS = (key, value) => {
	const isLessonStatus =
		key === 'cmi.core.lesson_status' && ['passed', 'completed'].includes(value)
	const isCompletionStatus =
		key === 'cmi.completion_status' && value === 'completed'
	const shouldRestart =
		(key === 'cmi.core.lesson_status' && value === 'failed') ||
		(key === 'cmi.completion_status' && value === 'incomplete')

	if (isLessonStatus || isCompletionStatus) {
		if (isSuccessfullyCompleted.value) return
		isSuccessfullyCompleted.value = true
	}

	if (
		isLessonStatus ||
		isCompletionStatus ||
		(shouldRestart && courseRestartOnFailure)
	) {
		saveProgress({
			is_complete: isSuccessfullyCompleted.value,
			scorm_content: '',
		})
		return
	}

	if (key === 'cmi.suspend_data' && !isSuccessfullyCompleted.value) {
		debouncedSaveProgress({
			is_complete: false,
			scorm_content: value,
		})
	}
}

const saveProgress = (scormDetails = null) => {
	// Bind to the lesson this save was actually issued for: lessonName may have
	// already moved on (see the watcher above) by the time these promises resolve.
	const lesson = props.lessonName
	const course = props.courseName

	call('lms.lms.doctype.course_lesson.course_lesson.save_progress', {
		lesson,
		course,
		scorm_details: scormDetails,
	}).then(() => {
		if (scormDetails?.is_complete && !hasEmittedComplete.value) {
			call(
				'lms.lms.doctype.course_lesson.course_lesson.get_lesson_completion_state',
				{ course, lesson }
			).then((state) => {
				console.log('[SCORMPlayer] get_lesson_completion_state response:', state)
				if (hasEmittedComplete.value || lesson !== props.lessonName) return
				hasEmittedComplete.value = true
				emit('complete', state)
			})
		}
	})
}

const setupSCORMAPI = () => {
	window.API_1484_11 = {
		Initialize: () => 'true',
		Terminate: () => {
			flushPendingProgress()
			return 'true'
		},
		GetValue: (key) => {
			console.log(`GET: ${key}`)
			return getDataFromLMS(key)
		},
		SetValue: (key, value) => {
			console.log(`SET: ${key} to value: ${value}`)

			saveDataToLMS(key, value)
			return 'true'
		},
		Commit: () => 'true',
		GetLastError: () => '0',
		GetErrorString: () => '',
		GetDiagnostic: () => '',
	}
	window.API = {
		LMSInitialize: () => 'true',
		LMSFinish: () => {
			flushPendingProgress()
			return 'true'
		},
		LMSGetValue: (key) => {
			console.log(`GET: ${key}`)
			return getDataFromLMS(key)
		},
		LMSSetValue: (key, value) => {
			console.log(`SET: ${key} to value: ${value}`)
			saveDataToLMS(key, value)
			return 'true'
		},
		LMSCommit: () => 'true',
		LMSGetLastError: () => '0',
		LMSGetErrorString: () => '',
		LMSGetDiagnostic: () => '',
	}
}
</script>
