"""Independent local checks; this program never imports the production SDK algorithms."""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import importlib.metadata
import io
import json
import math
from pathlib import Path
import re
import sys

import numpy as np
import CifFile
from ase.io import read as ase_read
from rdkit import Chem
from openbabel import openbabel as ob

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / ".tmp/format-reference"
NUMBER = re.compile(r"^([+-]?(?:\d+\.?\d*|\.\d+))(?:\((\d+)\))?([eE][+-]?\d+)?$")


def close(actual, expected, label):
    a, b = np.asarray(actual, dtype=float), np.asarray(expected, dtype=float)
    if a.shape != b.shape or not np.all(np.abs(a-b) <= 1e-9 + 1e-10*np.maximum(np.abs(a), np.abs(b))):
        raise AssertionError(f"{label}: {actual!r} != {expected!r}")


def number(text):
    text = str(text)
    if text in ("?", "."):
        return text, None
    match = NUMBER.fullmatch(text)
    if not match:
        raise AssertionError(f"Invalid independent numeric literal {text!r}")
    mantissa, su, exponent = match.groups()
    exponent = int(exponent[1:]) if exponent else 0
    decimals = len(mantissa.split(".")[1]) if "." in mantissa else 0
    return float(mantissa)*10**exponent, int(su)*10**(exponent-decimals) if su else None


def item(block, *names):
    for name in names:
        if name in block:
            return block[name]
    return None


def column(block, *names):
    value = item(block, *names)
    return value if isinstance(value, list) else [value] if value is not None else None


def read_cif(path):
    # PyCifRW prints grammar selection. Retain failures while keeping the report concise.
    with contextlib.redirect_stdout(io.StringIO()):
        return CifFile.ReadCif(str(path), grammar="auto", permissive=False)


def cif_crystal(file, expected):
    document = read_cif(ARTIFACTS / file)
    assert len(document.keys()) == 1
    block = document[document.keys()[0]]
    parameters = {}
    for key in ("a", "b", "c", "alpha", "beta", "gamma"):
        group = "length" if len(key) == 1 else "angle"
        value, uncertainty = number(item(block, f"_cell_{group}_{key}", f"_cell.{group}_{key}"))
        close(value, expected["cellParameters"][key], f"{file}:cell {key}")
        parameters[key] = value
        if key in expected.get("cellParameterUncertainties", {}):
            close(uncertainty, expected["cellParameterUncertainties"][key], f"{file}:cell SU {key}")
    lengths = np.array([parameters[k] for k in ("a", "b", "c")])
    alpha, beta, gamma = [math.radians(parameters[k]) for k in ("alpha", "beta", "gamma")]
    metric = np.outer(lengths, lengths) * np.array([
        [1, math.cos(gamma), math.cos(beta)],
        [math.cos(gamma), 1, math.cos(alpha)],
        [math.cos(beta), math.cos(alpha), 1],
    ])
    # Cholesky is independent of the production component construction.
    basis = np.linalg.cholesky(metric).T
    close(basis.T, expected["cellBasis"], f"{file}:basis")
    close(np.linalg.det(basis), expected["volume"], f"{file}:volume")
    types = column(block, "_atom_site_type_symbol", "_atom_site.type_symbol")
    labels = column(block, "_atom_site_label", "_atom_site.label")
    assert types is not None and len(types) == len(expected["atoms"])
    frames = {}
    for frame, suffix in (("fractional", "fract"), ("cartesian", "Cartn")):
        coordinates = [column(block, f"_atom_site_{suffix}_{c}", f"_atom_site.{suffix}_{c}") for c in "xyz"]
        if all(x is not None for x in coordinates):
            frames[frame] = [[number(coordinates[j][i]) for j in range(3)] for i in range(len(types))]
    for index, atom in enumerate(expected["atoms"]):
        symbol = re.match(r"[A-Z][a-z]?", types[index]).group()
        assert symbol == atom["element"] and labels[index] == atom["label"]
        if "oxidationState" in atom:
            assert types[index] == f'{atom["element"]}{atom["oxidationState"]}+'
        for frame, coordinates in frames.items():
            position = [x[0] for x in coordinates[index]]
            close(position, atom[frame], f"{file}:atom {index} {frame}")
            other = basis @ position if frame == "fractional" else np.linalg.solve(basis, position)
            close(other, atom["cartesian" if frame == "fractional" else "fractional"], f"{file}:coordinate transform")
            su_key = "fractionalSu" if frame == "fractional" else "cartesianSu"
            if su_key in atom:
                for j, value in enumerate(atom[su_key]):
                    actual = coordinates[index][j][1]
                    if value is None:
                        assert actual is None
                    else:
                        close(actual, value, f"{file}:coordinate SU")
        occupancy = column(block, "_atom_site_occupancy", "_atom_site.occupancy")
        if occupancy is not None:
            actual = number(occupancy[index])[0]
            if isinstance(atom.get("occupancy"), str):
                assert actual == atom["occupancy"]
            else:
                close(actual, atom.get("occupancy", 1), f"{file}:occupancy")
        for key, suffix, factor in (("displacementU", "U_iso_or_equiv", 1), ("displacementB", "B_iso_or_equiv", 8*math.pi**2)):
            values = column(block, f"_atom_site_{suffix}", f"_atom_site.{suffix}")
            if values is None or "displacementU" not in atom:
                continue
            actual, uncertainty = number(values[index])
            expected_u = atom["displacementU"]
            if isinstance(expected_u, str):
                assert actual == expected_u
            else:
                close(actual/factor, expected_u, f"{file}:U/B")
                if "displacementUSu" in atom:
                    close(uncertainty/factor, atom["displacementUSu"], f"{file}:U/B SU")
    operations = column(block, "_space_group_symop_operation_xyz", "_space_group_symop.operation_xyz", "_symmetry_equiv_pos_as_xyz", "_symmetry_equiv.pos_as_xyz")
    assert (len(operations) if operations else 1) == expected["operationCount"]
    return {"atoms": len(types), "operations": expected["operationCount"], "volume": float(np.linalg.det(basis))}


def cif_document(file, expected):
    document = read_cif(ARTIFACTS / file)
    block = document[expected["block"]]
    assert block["_prefixed"] == expected["prefixedText"]
    assert block["_description"] == expected["tripleText"]
    compound = block["_compound"]
    assert compound[0:3] == ["1", "?", "."]
    assert compound[3]["name"] == "value" and compound[3]["nested"] == ["2", "3"]
    return {"blocks": len(document.keys()), "containers": True, "unicode": True, "prefixText": True}


def molecule(case):
    path = ARTIFACTS / case["file"]
    mol = Chem.MolFromMolFile(str(path), sanitize=False, removeHs=False, strictParsing=True)
    assert mol is not None and mol.GetNumAtoms() == len(case["atoms"])
    assert mol.GetNumBonds() == len(case["bonds"])
    for atom, expected in zip(mol.GetAtoms(), case["atoms"]):
        assert atom.GetSymbol() == expected["element"]
        assert atom.GetFormalCharge() == expected["formalCharge"]
        assert atom.GetIsotope() == expected["isotope"]
        assert atom.GetAtomMapNum() == expected["atomMap"]
        position = mol.GetConformer().GetAtomPosition(atom.GetIdx())
        close([position.x, position.y, position.z], expected["cartesian"], f'{case["file"]}:coordinates')
        assert atom.GetNumRadicalElectrons() == {None: 0, "singlet": 2, "doublet": 1, "triplet": 2}[expected["radical"]]
        if "parityCode" in expected:
            assert atom.GetIntProp("molParity") == expected["parityCode"]
    version3 = "V3000" in path.read_text(encoding="utf-8")
    for bond, expected in zip(mol.GetBonds(), case["bonds"]):
        assert [bond.GetBeginAtomIdx()+1, bond.GetEndAtomIdx()+1] == expected["atoms"]
        assert bond.GetBondTypeAsDouble() == {"single": 1, "double": 2, "triple": 3, "aromatic": 1.5}[expected["order"]]
        marker = expected.get("stereo")
        if marker:
            key = "_MolFileBondCfg" if version3 else "_MolFileBondStereo"
            assert bond.GetIntProp(key) == ({"up": 1, "down": 3, "either": 2} if version3 else {"up": 1, "down": 6, "either": 3 if expected["order"] == "double" else 4})[marker]
    assert bool(mol.GetIntProp("_MolFileChiralFlag")) == case["stereoAbsolute"]
    spin_count = 0
    spin_reference = {}
    if any(atom["radical"] for atom in case["atoms"]):
        conversion = ob.OBConversion()
        assert conversion.SetInFormat("mol")
        independent = ob.OBMol()
        raw = path.read_text(encoding="utf-8")
        unfolded = raw.replace("\r\n", "\n").replace("\r", "\n")
        # Open Babel 3.1.0 tokenizes each physical line before continuation.
        # CTfile continuation is exact concatenation, including inside MASS/RAD tokens.
        # This reference-only transport normalization preserves every field and record ID;
        # RDKit above still validates the unmodified original file.
        continuation = re.compile(r"(?m)^(M  V30 [^\n]*)-\nM  V30 ")
        while continuation.search(unfolded):
            unfolded = continuation.sub(r"\1", unfolded)
        if unfolded != raw.replace("\r\n", "\n").replace("\r", "\n"):
            assert conversion.ReadString(independent, unfolded)
            spin_reference = {"spinOracleTransport": "CTfile physical continuations unfolded; scientific records unchanged", "spinInputSha256": hashlib.sha256(unfolded.encode("utf-8")).hexdigest()}
        else:
            assert conversion.ReadFile(independent, str(path))
        for expected in case["atoms"]:
            if expected["radical"]:
                atom = independent.GetAtom(expected["fileAtomNumber"])
                assert atom.GetSpinMultiplicity() == {"singlet": 1, "doublet": 2, "triplet": 3}[expected["radical"]]
                spin_count += 1
    return {"atoms": mol.GetNumAtoms(), "bonds": mol.GetNumBonds(), "independentSpinChecks": spin_count, **spin_reference}


def poscar(case):
    structure = ase_read(str(ARTIFACTS / case["file"]), format="vasp")
    close(structure.cell.array, case["basis"], "POSCAR:basis")
    close(structure.get_scaled_positions(wrap=False), case["fractional"], "POSCAR:Direct")
    assert structure.get_chemical_symbols() == case["species"]
    if "sdkParsed" in case:
        parsed = case["sdkParsed"]
        close(parsed["basis"], structure.cell.array, "POSCAR SDK import:basis")
        close(parsed["fractional"], structure.get_scaled_positions(wrap=False), "POSCAR SDK import:fractional")
        assert parsed["species"] == structure.get_chemical_symbols()
    return {"atoms": len(structure), "species": structure.get_chemical_symbols(), "volume": structure.get_volume(), "sdkImportChecked": "sdkParsed" in case}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", action="append", help="Only recheck explicitly affected files after a correction.")
    parser.add_argument("--report", default="results.json")
    parser.add_argument("--poscar-imports-only", action="store_true", help="Check only the authored POSCAR import inputs and their outputs; do not require unrelated CIF/MOL artifacts.")
    args = parser.parse_args()
    jobs = []
    if not args.poscar_imports_only:
        expected_cif = json.loads((ARTIFACTS / "cif-expected.json").read_text(encoding="utf-8"))
        expected_mol = json.loads((ARTIFACTS / "expected.json").read_text(encoding="utf-8"))
        for case in expected_cif["cases"]:
            jobs.extend((file, cif_crystal, case["expected"]) for file in [case["inputFile"], *case["outputFiles"]])
        document = expected_cif["document"]
        jobs.extend((document[key], cif_document, document["expected"]) for key in ("inputFile", "outputFile"))
        jobs.extend((case["file"], lambda _file, entry: molecule(entry), case) for case in expected_mol["molecules"])
        jobs.append((expected_mol["poscar"]["file"], lambda _file, entry: poscar(entry), expected_mol["poscar"]))
    imports_path = ARTIFACTS / "poscar-import-expected.json"
    if args.poscar_imports_only or imports_path.exists():
        imports = json.loads(imports_path.read_text(encoding="utf-8"))
        jobs.extend((case["file"], lambda _file, entry: poscar(entry), case) for case in imports["cases"])
    selected = set(args.file or [])
    results = []
    for file, check, expected in jobs:
        if selected and file not in selected:
            continue
        record = {"file": file, "sha256": hashlib.sha256((ARTIFACTS / file).read_bytes()).hexdigest()}
        try:
            record.update(status="passed", observed=check(file, expected))
        except Exception as error:
            record.update(status="failed", error=f"{type(error).__name__}: {error}")
        results.append(record)
    assert results, "No independent inputs selected."
    report = {
        "tools": {name: importlib.metadata.version(name) for name in ("PyCifRW", "numpy", "scipy", "rdkit", "ase", "openbabel-wheel")},
        "python": sys.version,
        "openBabelRuntime": ob.OBReleaseVersion(),
        "tolerance": "abs(a-b) <= 1e-9 + 1e-10*max(abs(a),abs(b))",
        "provenance": "Expected arithmetic values are authored inputs. Parsing uses independent local tools; no SDK scientific algorithms are imported.",
        "results": results,
    }
    (ARTIFACTS / args.report).write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 1 if any(row["status"] == "failed" for row in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
