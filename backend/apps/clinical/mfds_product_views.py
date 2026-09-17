from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .mfds_product_client import MfdsProductError, search_products


class DoctorMfdsProductSearchAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ingredient_name = str(request.query_params.get("ingredient_name", "")).strip()
        if not ingredient_name:
            return Response({"detail": "ingredient_name is required."}, status=400)
        try:
            return Response({"ingredient_name": ingredient_name, "products": search_products(ingredient_name)})
        except MfdsProductError as exc:
            return Response({"detail": str(exc)}, status=502)
