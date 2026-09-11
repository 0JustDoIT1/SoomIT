import re

# embedding 서비스 한도(512토큰, prefix 포함)보다 여유 있게 잡은 1차 목표 글자 수.
# 한국어는 토큰 밀도가 높을 수 있어 실제로 넘치면 embed_document()가 문장 경계에서 재분할한다.
TARGET_CHUNK_CHARS = 800
# 문장 경계를 못 찾을 때 글자 수로 강제 이분할하는 하한선. 이보다 짧은데도 서비스가
# 거부하면 더 쪼갤 수 없다는 뜻이라 무한 재귀 대신 에러로 처리한다.
MIN_SPLITTABLE_CHARS = 20

_SENTENCE_END_RE = re.compile(r"(?<=[.!?])\s+")
# PDF에서 글머리표 목록을 추출하면 각 항목의 실제 텍스트는 앞 문단에 붙어버리고
# '•' 글자만 항목 수만큼 줄줄이 남는 경우가 있다. 마침표가 없어 문장 경계로 안
# 끊기기 때문에, 이런 신호 없는 구간은 청킹 전에 미리 지운다.
_BULLET_RUN_RE = re.compile(r"(?:[•●▪]\s*){2,}")


def clean_text(text):
    return _BULLET_RUN_RE.sub(" ", text)


def split_into_sentences(text):
    text = clean_text(text).strip()
    if not text:
        return []
    return [sentence.strip() for sentence in _SENTENCE_END_RE.split(text) if sentence.strip()]


def chunk_text(text, target_chars=TARGET_CHUNK_CHARS):
    """문장 경계를 지키면서 target_chars 근처로 문서를 청크 목록으로 나눈다."""
    chunks = []
    current = ""
    for sentence in split_into_sentences(text):
        candidate = f"{current} {sentence}".strip() if current else sentence
        if current and len(candidate) > target_chars:
            chunks.append(current)
            current = sentence
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def split_in_half(text):
    """embedding 서비스가 너무 길다고 거부한 청크를 문장 경계(없으면 글자 수)로 반씩 나눈다."""
    sentences = split_into_sentences(text)
    if len(sentences) > 1:
        mid = len(sentences) // 2
        return " ".join(sentences[:mid]), " ".join(sentences[mid:])
    if len(text) < MIN_SPLITTABLE_CHARS:
        return None
    mid = len(text) // 2
    return text[:mid].strip(), text[mid:].strip()
