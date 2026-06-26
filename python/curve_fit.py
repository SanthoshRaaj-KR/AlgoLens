import numpy as np
from scipy.optimize import curve_fit as scipy_curve_fit
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

_R2_TIE_THRESHOLD = 0.02  # prefer simpler class if R² difference is within this


class FitRequest(BaseModel):
    n_values: list[float]
    latencies: list[float]  # p50 latency in ms for each n


class FitResponse(BaseModel):
    complexity_class: str
    exponent: float
    coefficient: float
    r_squared: float
    fitted_curve: list[list[float]]  # [[n, predicted_ms], ...]


# (function, canonical_exponent, complexity_order)
# complexity_order is used for tie-breaking: lower = simpler = preferred
_MODELS: list[tuple[str, object, float, int]] = [
    ("O(1)",       lambda n, c:           np.full_like(n, c, dtype=float),        0.0, 0),
    ("O(log n)",   lambda n, a, b:        a * np.log(np.maximum(n, 1)) + b,       0.5, 1),
    ("O(n)",       lambda n, a, b:        a * n + b,                               1.0, 2),
    ("O(n log n)", lambda n, a, b:        a * n * np.log(np.maximum(n, 1)) + b,   1.5, 3),
    ("O(n²)",      lambda n, a, b:        a * n**2 + b,                            2.0, 4),
    ("O(n³)",      lambda n, a, b:        a * n**3 + b,                            3.0, 5),
]


def _r_squared(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
    return float(1 - ss_res / ss_tot) if ss_tot > 0 else 1.0


@router.post("/fit", response_model=FitResponse)
def fit(req: FitRequest):
    if len(req.n_values) < 2:
        return FitResponse(
            complexity_class="O(1)", exponent=0.0, coefficient=0.0,
            r_squared=1.0, fitted_curve=[[req.n_values[0], req.latencies[0]]] if req.n_values else [],
        )

    n = np.array(req.n_values, dtype=float)
    y = np.array(req.latencies, dtype=float)

    candidates: list[tuple[float, int, str, np.ndarray, list]] = []

    for name, fn, exponent, order in _MODELS:
        try:
            popt, _ = scipy_curve_fit(fn, n, y, maxfev=10000)
            pred = fn(n, *popt)
            r2 = _r_squared(y, pred)
            candidates.append((r2, order, name, pred, list(popt)))
        except Exception:
            continue

    if not candidates:
        # fallback: assume O(n)
        return FitResponse(
            complexity_class="O(n)", exponent=1.0, coefficient=0.0,
            r_squared=0.0, fitted_curve=[[float(ni), float(yi)] for ni, yi in zip(n, y)],
        )

    # Sort by r2 descending, then by order ascending (simpler wins on tie)
    candidates.sort(key=lambda c: (-c[0], c[1]))

    best_r2, best_order, best_class, best_pred, best_popt = candidates[0]

    # Tie-break: if a simpler model is within R2_TIE_THRESHOLD, prefer it
    for r2, order, name, pred, popt in candidates[1:]:
        if best_r2 - r2 <= _R2_TIE_THRESHOLD and order < best_order:
            best_r2, best_order, best_class, best_pred, best_popt = r2, order, name, pred, popt
            break

    coeff = float(best_popt[0]) if best_popt else 0.0
    exponent = next(e for n_, fn, e, o in _MODELS if n_ == best_class)
    fitted_curve = [[float(ni), float(pi)] for ni, pi in zip(n, best_pred)]

    return FitResponse(
        complexity_class=best_class,
        exponent=exponent,
        coefficient=coeff,
        r_squared=float(best_r2),
        fitted_curve=fitted_curve,
    )
