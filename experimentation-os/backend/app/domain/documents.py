import hashlib
import json

from pydantic import BaseModel


def canonical_document(document: BaseModel) -> dict[str, object]:
    return document.model_dump(mode="json")


def document_digest(document: BaseModel) -> str:
    encoded = json.dumps(
        canonical_document(document), sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode()
    return hashlib.sha256(encoded).hexdigest()
