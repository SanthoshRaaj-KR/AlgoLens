import numpy as np
from scipy.optimize import curve_fit as scipy_curve_fit
from scipy.stats import pearsonr
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class FitRequest(BaseModel):
    n_values: list[float]
    latencies: list[float]  # p50 latency in ms for each n


class FitResponse(BaseModel):
    complexity_class: str
    exponent: float
    coefficient: float
    r_squared: float
    fitted_curve: list[list[float]]  # [[n, predicted_ms], ...]


_MODELS = {
    "O(1)":       (lambda n, c: np.full_like(n, c, dtype=float),          0.0),
    "O(log n)":   (lambda n, a, b: a * np.log(np.maximum(n, 1)) + b,      1.0),
    "O(n)":       (lambda n, a, b: a * n + b,                              1.0),
    "O(n log n)": (lambda n, a, b: a * n * np.log(np.maximum(n, 1)) + b,  1.0),
    "O(n²)":      (lambda n, a, b: a * n**2 + b,                          2.0),
}

_EXPONENTS = {
    "O(1)": 0.0, "O(log n)": 0.5, "O(n)": 1.0, "O(n log n)": 1.5, "O(n²)": 2.0,
}


@router.post("/fit", response_model=FitResponse)
def fit(req: FitRequest):
    n = np.array(req.n_values, dtype=float)
    y = np.array(req.latencies, dtype=float)

    best_class = "O(n)"
    best_r2 = -np.inf
    best_pred = y

    for name, (fn, _) in _MODELS.items():
        try:
            popt, _ = scipy_curve_fit(fn, n, y, maxfev=5000)
            pred = fn(n, *popt)
            ss_res = np.sum((y - pred) ** 2)
            ss_tot = np.sum((y - np.mean(y)) ** 2)
            r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 1.0
            if r2 > best_r2:
                best_r2 = r2
                best_class = name
                best_pred = pred
                best_popt = popt
        except Exception:
            continue

    fn, _ = _MODELS[best_class]
    coeff = float(best_popt[0]) if len(best_popt) > 0 else 0.0
    fitted_curve = [[float(ni), float(pi)] for ni, pi in zip(n, best_pred)]

    return FitResponse(
        complexity_class=best_class,
        exponent=_EXPONENTS[best_class],
        coefficient=coeff,
        r_squared=float(best_r2),
        fitted_curve=fitted_curve,
    )
