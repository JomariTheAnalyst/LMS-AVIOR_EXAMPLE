import frappe

from lms.lms.test_helpers import BaseTestUtils
from lms.lms.utils import (
	get_batch_count,
	get_batches,
	get_course_count,
	get_course_details,
	get_courses,
)


class TestCourseCatalogVisibility(BaseTestUtils):
	"""get_courses / get_course_count / get_batches / get_batch_count query through
	frappe.get_all (ignore_permissions=True) and used to pass the client's filters
	straight through, so the `published=1` restriction lived only in the Vue
	frontend. The endpoints now gate server-side: a non-staff caller sees a course
	or batch only if it is published or they are enrolled in it, whatever the
	request says."""

	def setUp(self):
		super().setUp()
		self.original_user = frappe.session.user
		frappe.set_user("Administrator")
		suffix = frappe.generate_hash(length=8).lower()

		self.learner = self._create_user(f"catalog-learner-{suffix}@example.com", "Catalog", "Learner", ["LMS Student"])
		self.enrolled = self._create_user(f"catalog-enrolled-{suffix}@example.com", "Catalog", "Enrolled", ["LMS Student"])
		self.moderator = self._create_user(f"catalog-moderator-{suffix}@example.com", "Catalog", "Moderator", ["Moderator"])

		self.published_course = self._create_course(title=f"Catalog Published {suffix}", instructor="Administrator")
		self.draft_course = self._create_course(title=f"Catalog Draft {suffix}", instructor="Administrator")
		# On a site with avior installed its assigned-only flag defaults to 1;
		# these fixtures are about `published` alone, so make them plainly public.
		if frappe.db.has_column("LMS Course", "avior_assigned_only"):
			for course in (self.published_course, self.draft_course):
				frappe.db.set_value("LMS Course", course.name, "avior_assigned_only", 0)
		frappe.db.set_value("LMS Course", self.draft_course.name, "published", 0)
		# Enrolled before unpublishing: the course stays reachable for that learner.
		self._create_enrollment(self.enrolled.name, self.draft_course.name)

		evaluator = self._create_evaluator(self.moderator.name)
		self.draft_batch = self._create_batch(
			self.published_course.name,
			instructor="Administrator",
			title=f"Catalog Draft Batch {suffix}",
			evaluator=evaluator.name,
		)
		frappe.db.set_value("LMS Batch", self.draft_batch.name, "published", 0)

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()
		frappe.set_user(self.original_user)

	def _names(self, rows):
		return {row.name for row in rows}

	# --- 3a: the published filter is no longer the client's to decide -----------

	def test_learner_requesting_unpublished_courses_gets_nothing(self):
		frappe.set_user(self.learner.name)

		self.assertEqual(get_courses(filters={"published": 0}), [])
		self.assertEqual(get_course_count(filters={"published": 0}), 0)

	def test_learner_omitting_the_published_filter_still_sees_only_published(self):
		frappe.set_user(self.learner.name)

		names = self._names(get_courses(filters={}))
		self.assertIn(self.published_course.name, names)
		self.assertNotIn(self.draft_course.name, names)

	def test_learner_cannot_name_a_draft_course_directly(self):
		frappe.set_user(self.learner.name)

		self.assertEqual(get_courses(filters={"name": self.draft_course.name}), [])
		self.assertEqual(get_courses(filters={"name": ["in", [self.draft_course.name]]}), [])

	def test_enrolled_learner_keeps_their_unpublished_course(self):
		# The Enrolled tab drops the published filter on purpose, and
		# get_course_details already lets a member in; the list must agree.
		frappe.set_user(self.enrolled.name)

		names = self._names(get_courses(filters={"enrolled": 1}))
		self.assertIn(self.draft_course.name, names)
		self.assertNotEqual(get_course_details(self.draft_course.name), {})

	def test_moderator_still_lists_unpublished_courses(self):
		frappe.set_user(self.moderator.name)

		names = self._names(get_courses(filters={"published": 0}))
		self.assertIn(self.draft_course.name, names)

	def test_learner_requesting_unpublished_batches_gets_nothing(self):
		frappe.set_user(self.learner.name)

		self.assertNotIn(self.draft_batch.name, {row.name for row in get_batches(filters={"published": 0})})
		self.assertEqual(get_batch_count(filters={"published": 0}), 0)

	def test_guest_sees_no_drafts(self):
		frappe.set_user("Guest")

		self.assertEqual(get_courses(filters={"published": 0}), [])

	# --- regression: published courses are untouched ------------------------------

	def test_published_course_behaves_as_before(self):
		frappe.set_user(self.learner.name)

		self.assertIn(self.published_course.name, self._names(get_courses(filters={"published": 1})))
		details = get_course_details(self.published_course.name)
		self.assertEqual(details.name, self.published_course.name)
		self.assertFalse(details.membership)

	def test_guessed_url_for_draft_course_reveals_nothing(self):
		frappe.set_user(self.learner.name)

		self.assertEqual(get_course_details(self.draft_course.name), {})
