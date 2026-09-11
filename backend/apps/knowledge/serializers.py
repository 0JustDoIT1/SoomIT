from rest_framework import serializers

from apps.knowledge.services.search import DEFAULT_TOP_K


class AskKnowledgeRequestSerializer(serializers.Serializer):
    question = serializers.CharField(min_length=1, max_length=2000)
    top_k = serializers.IntegerField(required=False, default=DEFAULT_TOP_K, min_value=1, max_value=20)


class KnowledgeSourceSerializer(serializers.Serializer):
    document = serializers.CharField()
    chunk_index = serializers.IntegerField()
    distance = serializers.FloatField()


class AskKnowledgeResponseSerializer(serializers.Serializer):
    answer = serializers.CharField()
    sources = KnowledgeSourceSerializer(many=True)
