import io
import re


def extract_text(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        import pymupdf
        doc = pymupdf.open(stream=data, filetype="pdf")
        return "\n".join(page.get_text() for page in doc)
    if name.endswith(".docx"):
        import docx
        d = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in d.paragraphs)
    return data.decode("utf-8", errors="ignore")


def chunk_text(text: str, size: int = 800, overlap: int = 100) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    chunks, i = [], 0
    while i < len(text):
        chunks.append(text[i:i + size])
        i += size - overlap
    return [c for c in chunks if len(c.strip()) > 20]


def extract_pages(filename: str, data: bytes) -> list:
    """Returns [(page_number_or_None, text)]. Only PDFs have reliable page numbers."""
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        import pymupdf
        doc = pymupdf.open(stream=data, filetype="pdf")
        return [(i + 1, page.get_text()) for i, page in enumerate(doc)]
    if name.endswith(".docx"):
        import docx
        d = docx.Document(io.BytesIO(data))
        return [(None, "\n".join(p.text for p in d.paragraphs))]
    return [(None, data.decode("utf-8", errors="ignore"))]
