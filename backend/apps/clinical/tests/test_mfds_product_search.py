import io
import json
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.clinical.mfds_product_client import search_products
from apps.clinical.mfds_product_views import DoctorMfdsProductSearchAPIView


PRODUCT = {"ITEM_SEQ": "123456", "ITEM_NAME": "Aspirin", "ITEM_INGR_NAME": "Acetylsalicylic acid"}


class MfdsProductSearchTests(SimpleTestCase):
    @patch.dict("os.environ", {"MFDS_SERVICE_KEY": "test-key"})
    @patch("apps.clinical.mfds_product_client.urlopen")
    def test_product_name_search_uses_existing_mfds_operation(self, urlopen):
        urlopen.return_value = io.BytesIO(json.dumps({"response": {"header": {"resultCode": "00"}, "body": {"items": [PRODUCT]}}}).encode())

        products = search_products("Aspirin", search_by="product")

        self.assertEqual(products[0]["item_seq"], "123456")
        self.assertEqual(products[0]["item_name"], "Aspirin")
        url = urlopen.call_args.args[0]
        self.assertIn("item_name=Aspirin", url)
        self.assertNotIn("item_ingr_name=", url)

    @patch("apps.clinical.mfds_product_views.search_products")
    def test_query_falls_back_to_ingredient_and_keeps_legacy_contract(self, search):
        search.side_effect = [[], [{"item_seq": "123456"}], [{"item_seq": "123456"}]]
        factory = APIRequestFactory()
        user = type("User", (), {"is_authenticated": True})()
        view = DoctorMfdsProductSearchAPIView.as_view()

        request = factory.get("/api/doctor/cases/mfds-products/", {"q": "Aspirin"})
        force_authenticate(request, user=user)
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["products"][0]["item_seq"], "123456")
        self.assertEqual(search.call_args_list[0].kwargs, {"search_by": "product"})
        self.assertEqual(search.call_args_list[1].args, ("Aspirin",))

        request = factory.get("/api/doctor/cases/mfds-products/", {"ingredient_name": "Aspirin"})
        force_authenticate(request, user=user)
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["ingredient_name"], "Aspirin")
