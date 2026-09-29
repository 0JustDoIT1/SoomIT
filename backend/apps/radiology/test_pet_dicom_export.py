from django.test import SimpleTestCase, override_settings

from apps.radiology.services.pet_dicom_export import _orthanc_read_session


@override_settings(
    ORTHANC_USERNAME="reader",
    ORTHANC_PASSWORD="secret",
)
class OrthancPetReadSessionTests(SimpleTestCase):
    def test_retries_only_safe_get_requests_for_transient_failures(self):
        session = _orthanc_read_session()
        try:
            retries = session.get_adapter("http://").max_retries
            self.assertEqual(retries.total, 4)
            self.assertEqual(retries.connect, 4)
            self.assertEqual(retries.read, 4)
            self.assertEqual(retries.status, 4)
            self.assertEqual(retries.allowed_methods, frozenset({"GET"}))
            self.assertEqual(retries.status_forcelist, [502, 503, 504])
            self.assertEqual(session.auth, ("reader", "secret"))
        finally:
            session.close()
