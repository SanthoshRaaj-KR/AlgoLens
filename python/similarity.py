import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class SimilarityRequest(BaseModel):
    query_vector: list[float]
    stored_vectors: list[list[float]]


class SimilarityResult(BaseModel):
    index: int
    score: float


@router.post("/similarity", response_model=list[SimilarityResult])
def similarity(req: SimilarityRequest):
    q = np.array(req.query_vector, dtype=float)
    q_norm = np.linalg.norm(q)

    results = []
    for i, vec in enumerate(req.stored_vectors):
        v = np.array(vec, dtype=float)
        v_norm = np.linalg.norm(v)
        if q_norm == 0 or v_norm == 0:
            score = 0.0
        else:
            score = float(np.dot(q, v) / (q_norm * v_norm))
        results.append(SimilarityResult(index=i, score=score))

    results.sort(key=lambda r: r.score, reverse=True)
    return results
