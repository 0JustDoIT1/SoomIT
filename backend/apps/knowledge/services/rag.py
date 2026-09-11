from .medgemma_client import request_chat_completion
from .search import DEFAULT_TOP_K, search_knowledge

SYSTEM_PROMPT_TEMPLATE = (
    "다음은 참고 문서에서 검색된 내용입니다. 이 내용에 근거해서만 답변하고, "
    "내용에 없는 사실은 추측하지 말고 모른다고 답하세요.\n\n{context}"
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
