from rest_framework import serializers

from apps.knowledge.services.search import DEFAULT_TOP_K


class AskKnowledgeRequestSerializer(serializers.Serializer):
    question = serializers.CharField(min_length=1, max_length=2000)
    top_k = serializers.IntegerField(required=False, default=DEFAULT_TOP_K, min_value=1, max_value=20)


class KnowledgeSourceSerializer(serializers.Serializer):
    document = serializers.CharField()
    chunk_index = serializers.IntegerField()
    distance = serializers.FloatField()
    excerpt = serializers.CharField(required=False)
    source_uri = serializers.CharField(required=False, allow_null=True, allow_blank=True)


class AskKnowledgeResponseSerializer(serializers.Serializer):
    answer = serializers.CharField()
    sources = KnowledgeSourceSerializer(many=True)


class SearchKnowledgeRequestSerializer(serializers.Serializer):
    query = serializers.CharField(min_length=1, max_length=2000)
    top_k = serializers.IntegerField(required=False, default=DEFAULT_TOP_K, min_value=1, max_value=20)


class KnowledgeChunkSerializer(serializers.Serializer):
    document = serializers.CharField()
    chunk_index = serializers.IntegerField()
    content = serializers.CharField()
    distance = serializers.FloatField()


class SearchKnowledgeResponseSerializer(serializers.Serializer):
    chunks = KnowledgeChunkSerializer(many=True)
