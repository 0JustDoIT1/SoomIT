from .medgemma_client import request_chat_completion
from .search import DEFAULT_TOP_K, search_knowledge

SYSTEM_PROMPT_TEMPLATE = (
    "당신은 폐암 진료 근거를 설명하는 보조 시스템입니다. 다음 검색 문서에 근거해서만 답하세요. "
    "질문에 명시된 암종, 병기, 바이오마커 및 치료 차수를 정확히 구분하고, 다른 병기나 조건의 "
    "권고를 질문 대상에게 적용하지 마세요. 문서만으로 질문의 조건을 확인할 수 없으면 모른다고 "
    "답하세요. 각 의학적 주장 뒤에는 반드시 근거 청크 번호를 [1] 형식으로 표시하세요. "
    "답변은 사용자의 언어로 작성하세요.\n\n검색 문서:\n{context}"
)


def _format_context(chunks):
    return "\n\n".join(f"[{i}] {chunk.content}" for i, chunk in enumerate(chunks, start=1))


def _format_sources(chunks):
    return [
        {"document": chunk.document.title, "chunk_index": chunk.chunk_index, "distance": chunk.distance}
        for chunk in chunks
    ]


def answer_with_rag(question, top_k=DEFAULT_TOP_K, max_tokens=300):
    """질문을 pgvector로 검색해 찾은 청크를 medgemma 프롬프트에 컨텍스트로 넣고 답변을 생성한다."""
    chunks = search_knowledge(question, top_k=top_k)

    messages = []
    if chunks:
        messages.append({"role": "system", "content": SYSTEM_PROMPT_TEMPLATE.format(context=_format_context(chunks))})
    messages.append({"role": "user", "content": question})

    answer = request_chat_completion(messages, max_tokens=max_tokens)
    return {"answer": answer, "sources": _format_sources(chunks)}
