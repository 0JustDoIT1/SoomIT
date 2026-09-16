from urllib.parse import parse_qs, urlparse

from rest_framework.pagination import CursorPagination
from rest_framework.response import Response


class CaseChatMessageCursorPagination(CursorPagination):
    page_size = 50
    ordering = ("-created_at", "-id")
    cursor_query_param = "cursor"

    @staticmethod
    def _cursor_from_link(link):
        if not link:
            return None
        return parse_qs(urlparse(link).query).get("cursor", [None])[0]

    def get_paginated_response(self, data):
        return Response(
            {
                "results": data,
                "next_cursor": self._cursor_from_link(self.get_next_link()),
            }
        )
