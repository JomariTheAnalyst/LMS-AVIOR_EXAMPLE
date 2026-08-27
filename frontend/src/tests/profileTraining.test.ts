import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	enableAutoUnmount,
	flushPromises,
	mount,
	RouterLinkStub,
} from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.stubGlobal('__', (text: string) => text)

const h = vi.hoisted(() => ({
	call: vi.fn(),
	profileData: null as Record<string, unknown> | null,
	sessionUser: 'learner@example.com',
}))

vi.mock('frappe-ui', () => ({
	call: h.call,
	createResource: (config: { url: string }) =>
		config.url === 'lms.lms.api.get_profile_details'
			? {
					data: h.profileData,
					fetched: true,
					error: null,
					reload: vi.fn(),
				}
			: { data: null, reload: vi.fn(), submit: vi.fn() },
	toast: { success: vi.fn(), error: vi.fn() },
	usePageMeta: vi.fn(),
	Button: {
		props: ['label', 'loading'],
		emits: ['click'],
		template: `<button @click="$emit('click')">{{ label }}<slot /></button>`,
	},
	TabButtons: {
		props: ['options', 'modelValue'],
		emits: ['update:modelValue'],
		template: `<nav><button v-for="option in options" :key="option.value">{{ option.label }}</button></nav>`,
	},
	Tooltip: { template: `<div><slot /></div>` },
}))

vi.mock('@/stores/session', () => ({
	sessionStore: () => ({ user: { doc: {} }, brand: {} }),
}))
vi.mock('@/utils/composables', () => ({
	useScreenSize: () => ({ isMobile: { value: false } }),
}))
vi.mock('@/utils', () => ({
	convertToTitleCase: (value: string) =>
		value.charAt(0).toUpperCase() + value.slice(1),
}))
vi.mock('@/components/Layouts/PageHeader.vue', () => ({
	default: { template: `<div><slot /><slot name="actions" /></div>` },
}))
vi.mock('@/components/HeaderButton.vue', () => ({
	default: { props: ['label'], template: `<button>{{ label }}</button>` },
}))
vi.mock('@/components/Modals/EditCoverImage.vue', () => ({
	default: { template: `<div><slot /></div>` },
}))
vi.mock('@/components/UserAvatar.vue', () => ({
	default: { template: `<div />` },
}))
vi.mock('@/components/NoPermission.vue', () => ({
	default: { template: `<div>NO PERMISSION</div>` },
}))
vi.mock('@/pages/NotFound.vue', () => ({
	default: { template: `<div>NOT FOUND</div>` },
}))
vi.mock('@/utils/safeUrl', () => ({ safeUrl: (value: string) => value }))

import { routes } from '@/routes'
import Profile from '@/pages/Profile.vue'
import ProfileTraining from '@/pages/ProfileTraining.vue'

const activeCourse = {
	enrollment: 'ENROLL-ACTIVE',
	name: 'active-course',
	title: 'Bridge Resource Management',
	image: '/files/bridge.webp',
	progress: 45,
	enrolled_at: '2026-08-20 10:00:00',
}
const completedCourse = {
	enrollment: 'ENROLL-COMPLETE',
	name: 'completed-course',
	title: 'Maritime Safety Essentials',
	image: null,
	progress: 100,
	enrolled_at: '2026-08-19 10:00:00',
}

const trainingResponse = (items: Array<Record<string, unknown>>) => ({
	items,
	has_more: false,
	next_offset: null,
})

const mountTraining = (profileName = h.sessionUser) =>
	mount(ProfileTraining, {
		props: { profile: { data: { name: profileName } } },
		global: {
			provide: { $user: { data: { name: h.sessionUser } } },
			mocks: { __: (text: string) => text },
			stubs: { 'router-link': RouterLinkStub },
		},
	})

enableAutoUnmount(afterEach)

describe('learner profile training', () => {
	beforeEach(() => {
		h.profileData = {
			name: h.sessionUser,
			username: 'learner',
			full_name: 'Training Learner',
			headline: 'Learner',
			roles: ['LMS Student'],
		}
		h.call.mockReset()
		h.call.mockImplementation(
			(_url: string, params: { status: 'active' | 'completed' }) =>
				Promise.resolve(
					params.status === 'active'
						? trainingResponse([activeCourse])
						: trainingResponse([completedCourse])
				)
		)
	})

	it('registers the Training child route on the real route table', () => {
		const router = createRouter({ history: createMemoryHistory(), routes })
		const resolved = router.resolve('/user/learner/training')

		expect(resolved.name).toBe('ProfileTraining')
		expect(resolved.matched.map((record) => record.name)).toEqual([
			'Profile',
			'ProfileTraining',
		])
	})

	it('shows the Training tab only on the signed-in user profile', async () => {
		const router = createRouter({ history: createMemoryHistory(), routes })
		await router.push('/user/learner')
		const ownProfile = mount(Profile, {
			props: { username: 'learner' },
			global: {
				plugins: [router],
				provide: { $user: { data: { name: h.sessionUser } } },
				mocks: { __: (text: string) => text },
				stubs: { 'router-view': true },
			},
		})
		await flushPromises()
		expect(ownProfile.text()).toContain('Training')
		ownProfile.unmount()

		h.profileData = {
			name: 'other@example.com',
			username: 'other',
			full_name: 'Other Learner',
			headline: 'Learner',
			roles: ['LMS Student'],
		}
		const otherProfile = mount(Profile, {
			props: { username: 'other' },
			global: {
				plugins: [router],
				provide: { $user: { data: { name: h.sessionUser } } },
				mocks: { __: (text: string) => text },
				stubs: { 'router-view': true },
			},
		})
		await flushPromises()
		expect(otherProfile.text()).not.toContain('Training')
	})

	it('renders progress and separates active from completed courses', async () => {
		const wrapper = mountTraining()
		await flushPromises()

		const active = wrapper.get('[data-testid="training-active"]')
		const completed = wrapper.get('[data-testid="training-completed"]')
		expect(active.text()).toContain('Bridge Resource Management')
		expect(active.text()).toContain('45%')
		expect(active.text()).toContain('In Progress')
		expect(completed.text()).toContain('Maritime Safety Essentials')
		expect(completed.text()).toContain('100%')
		expect(completed.text()).toContain('Completed')
		expect(active.text()).not.toContain('Maritime Safety Essentials')
	})

	it('links the whole training card to the existing CourseDetail route', async () => {
		const wrapper = mountTraining()
		await flushPromises()

		const targets = wrapper
			.findAllComponents(RouterLinkStub)
			.map((link) => link.props('to'))
		expect(targets).toContainEqual({
			name: 'CourseDetail',
			params: { courseName: 'active-course' },
		})
	})

	it('renders both empty states when no training exists', async () => {
		h.call.mockResolvedValue(trainingResponse([]))
		const wrapper = mountTraining()
		await flushPromises()

		expect(wrapper.text()).toContain(
			"You don't have any active courses right now."
		)
		expect(wrapper.text()).toContain('No completed courses yet.')
	})

	it('does not expose training UI or request data for another profile', async () => {
		const wrapper = mountTraining('other@example.com')
		await flushPromises()

		expect(wrapper.text()).toBe('')
		expect(h.call).not.toHaveBeenCalled()
	})
})
