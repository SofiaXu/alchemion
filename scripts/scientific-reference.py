"""Generate reviewed M3 oracles independently of all TypeScript production code.

Run once with .tmp/m3-reference-env/Scripts/python.exe. No production imports,
no random perturbation, and no silent overwrite of an existing reference file.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
import platform
from pathlib import Path

import numpy as np
import scipy
from scipy.spatial import ConvexHull, Voronoi


CASES = [
    ("cubic", [[2, 0, 0], [0, 2, 0], [0, 0, 2]]),
    ("orthorhombic", [[2, 0, 0], [0, 3, 0], [0, 0, 4]]),
    ("monoclinic", [[2, 0, 0], [0, 3, 0], [1, 0, 4]]),
    ("triclinic", [[2, 0, 0], [0.5, 3, 0], [0.25, 0.75, 4]]),
    ("tilted-basis", [[1, 1, 0], [-1, 1, 0], [0.25, 0.5, 2]]),
    ("multi-shell", [[1, 0, 0], [2.2, 0.5, 0], [0, 0, 1]]),
]


def parameters(matrix: np.ndarray) -> dict[str, float]:
    """Dot products on independent supplied basis vectors, not a TS formula copy."""
    vectors = matrix.T
    lengths = np.linalg.norm(vectors, axis=1)
    angles = []
    for i, j in [(1, 2), (0, 2), (0, 1)]:
        angles.append(math.degrees(math.acos(float(np.dot(vectors[i], vectors[j]) / (lengths[i] * lengths[j])))))
    return dict(zip(["a", "b", "c", "alpha", "beta", "gamma"], [*map(float, lengths), *angles]))


def bz_reference(matrix: np.ndarray) -> dict:
    """Qhull Voronoi origin region; completeness independently uses SVD."""
    reciprocal = 2 * np.pi * np.linalg.inv(matrix).T
    smallest_singular = float(np.linalg.svd(reciprocal, compute_uv=False)[-1])
    for shell in [3, 6, 12, 24]:
        indices = np.array(list(itertools.product(range(-shell, shell + 1), repeat=3)), dtype=int)
        origin = int(np.flatnonzero(np.all(indices == 0, axis=1))[0])
        lattice = indices @ reciprocal.T
        voronoi = Voronoi(lattice, qhull_options="Qbb Qc Qz")
        region = voronoi.regions[voronoi.point_region[origin]]
        if -1 in region or len(region) < 4:
            continue
        vertices = voronoi.vertices[region]
        radius = float(np.linalg.norm(vertices, axis=1).max())
        omitted_bound = smallest_singular * (shell + 1) * (1 - 1e-12)
        if omitted_bound <= 2 * radius + 1e-10:
            continue
        # Verify every enumerated halfspace, independently of the Voronoi topology.
        residual = float(np.max(vertices @ lattice.T - np.sum(lattice * lattice, axis=1) / 2))
        if residual > 1e-9:
            raise ValueError(f"Independent reference halfspace residual {residual}")
        ordered_vertices = sorted(vertices.tolist())
        vertex_map = {index: ordered_vertices.index(voronoi.vertices[index].tolist()) for index in region}
        faces = []
        for pair, ridge in zip(voronoi.ridge_points, voronoi.ridge_vertices):
            if origin not in pair:
                continue
            if -1 in ridge:
                raise ValueError("Origin region unexpectedly has an infinite ridge")
            neighbor = int(pair[1] if pair[0] == origin else pair[0])
            faces.append({"reciprocalIndex": indices[neighbor].tolist(), "vertices": sorted(vertex_map[index] for index in ridge)})
        faces.sort(key=lambda face: face["reciprocalIndex"])
        volume = float(ConvexHull(vertices).volume)
        expected_volume = float(abs(np.linalg.det(reciprocal)))
        if not math.isclose(volume, expected_volume, rel_tol=1e-10, abs_tol=1e-9):
            raise ValueError("Independent Voronoi volume is not reciprocal primitive volume")
        return {
            "reciprocalBasis": reciprocal.T.tolist(),
            "vertices": ordered_vertices,
            "faces": faces,
            "volume": volume,
            "certificate": {"shell": shell, "smallestSingularValue": smallest_singular, "omittedVectorLowerBound": omitted_bound, "maxVertexRadius": radius, "halfspaceResidual": residual},
        }
    raise ValueError("Independent reference budget exhausted without completeness proof")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "packages/alchemion/src/core/__tests__/fixtures/scientific-reference.json")
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError("Reference already exists; do not regenerate an accepted oracle silently")
    if platform.python_version_tuple()[:2] != ("3", "12") or np.__version__ != "2.2.6" or scipy.__version__ != "1.15.3":
        raise RuntimeError("Reference requires Python 3.12, NumPy 2.2.6 and SciPy 1.15.3")
    fractional = np.array([1.25, -0.5, 0.375])
    cell_cases, bz_cases = [], []
    for name, basis in CASES:
        matrix = np.array(basis, dtype=float).T
        cell_cases.append({"name": name, "basis": basis, "parameters": parameters(matrix), "volume": float(np.linalg.det(matrix)), "fractional": fractional.tolist(), "cartesian": (matrix @ fractional).tolist(), "inverse": np.linalg.inv(matrix).T.tolist()})
        bz_cases.append({"name": name, "basis": basis, **bz_reference(matrix)})
    source = json.dumps(CASES, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    output = {
        "environment": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__, "method": "NumPy inverse/determinant/SVD; SciPy Qhull Voronoi origin region and ConvexHull volume; no production imports", "inputsSha256": hashlib.sha256(source).hexdigest(), "references": ["https://docs.scipy.org/doc/scipy-1.15.3/reference/generated/scipy.spatial.Voronoi.html", "https://docs.scipy.org/doc/scipy-1.15.3/reference/generated/scipy.spatial.ConvexHull.html"]},
        "cellCases": cell_cases,
        "bzCases": bz_cases,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(json.dumps({"output": str(args.output), "sha256": digest, "cellCases": len(cell_cases), "bzCases": len(bz_cases), "certifiedShells": [case["certificate"]["shell"] for case in bz_cases]}))


if __name__ == "__main__":
    main()
