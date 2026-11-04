"""Build the pinned browser-only spglib artifact. Run with an active Emscripten SDK."""

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

SPGLIB_COMMIT = "c633404d67b2aa341ae748819c542e81c0c1f55d"
HERE = Path(__file__).resolve().parent
OUTPUT = HERE.parents[1] / "packages/alchemion/src/viewer/runtime/spglib"


def capture(*command):
    return subprocess.check_output(command, text=True).strip()


def license_bytes(path):
    return b"\n".join(line.rstrip() for line in path.read_bytes().splitlines()) + b"\n"


def main():
    source = Path(sys.argv[1]).resolve()
    if capture("git", "-C", str(source), "rev-parse", "HEAD") != SPGLIB_COMMIT:
        raise SystemExit("Expected spglib 2.6.0 at the pinned commit.")
    if capture("git", "-C", str(source), "status", "--porcelain"):
        raise SystemExit("Expected a clean spglib checkout.")
    emcc = shutil.which("emcc")
    if not emcc or " 4.0.23 " not in f" {capture(emcc, '--version').splitlines()[0]} ":
        raise SystemExit("Activate Emscripten 4.0.23 first.")
    exports = (
        "malloc", "free", "modeling_find", "modeling_header", "modeling_operation",
        "modeling_orbit", "modeling_primitive_site", "spg_free_dataset", "spg_get_error_code",
    )
    with tempfile.TemporaryDirectory() as scratch:
        build = Path(scratch)
        version = (source / "src/version.h.in").read_text(encoding="utf-8")
        for name, value in {
            "VERSION_MAJOR": "2", "VERSION_MINOR": "6", "VERSION_PATCH": "0",
            "VERSION": "2.6.0", "VERSION_FULL": "2.6.0", "COMMIT": SPGLIB_COMMIT,
        }.items():
            version = version.replace(f"@Spglib_{name}@", value)
        (build / "version.h").write_text(version, encoding="utf-8")
        artifact = build / "spglib.wasm"
        subprocess.run([
            emcc, "-O3", "-DNDEBUG", "--no-entry", "-sSTANDALONE_WASM=1",
            "-sALLOW_MEMORY_GROWTH=1", "-sMAXIMUM_MEMORY=134217728", "-sSTACK_SIZE=262144",
            "-sFILESYSTEM=0", "-I", str(source / "include"), "-I", str(build),
            *(f"-Wl,--export={name}" for name in exports),
            str(HERE / "bridge.c"),
            *(str(path) for path in sorted((source / "src").glob("*.c"))),
            "-o", str(artifact),
        ], check=True)
        OUTPUT.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(artifact, OUTPUT / artifact.name)
        (OUTPUT / "LICENSE.txt").write_bytes(license_bytes(source / "COPYING"))
        toolchain = Path(emcc).resolve().parent
        (OUTPUT / "TOOLCHAIN_LICENSES.txt").write_bytes(b"\n\n".join([
            b"Emscripten 4.0.23",
            license_bytes(toolchain / "LICENSE"),
            b"musl libc notices as distributed by Emscripten 4.0.23",
            license_bytes(toolchain / "system/lib/libc/musl/COPYRIGHT"),
        ]))
        files = {
            name: hashlib.sha256((OUTPUT / name).read_bytes()).hexdigest()
            for name in ("spglib.wasm", "LICENSE.txt", "TOOLCHAIN_LICENSES.txt")
        }
        manifest = {
            "schemaVersion": 1,
            "spglib": {"version": "2.6.0", "commit": SPGLIB_COMMIT},
            "emscripten": {"version": "4.0.23", "build": "aaa43392544d695232b70eda706d751f18980c2a"},
            "files": files,
        }
        (OUTPUT / "manifest.json").write_bytes((json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
        print(f"spglib.wasm SHA256 {files['spglib.wasm']}")


if __name__ == "__main__":
    main()
