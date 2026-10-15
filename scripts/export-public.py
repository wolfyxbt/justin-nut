"""Copy an explicit public file list into a new directory without Git history."""
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist/public"
FILES = (
    ".gitattributes", ".gitignore", ".nojekyll", "LICENSE", "README.md",
    "THIRD_PARTY_NOTICES.md", "index.html", "style.css", "game.js", "plants.js",
    "package.json", "package-lock.json",
    ".github/workflows/verify.yml", "docs/CHARACTER.md", "docs/DEVELOPMENT.md",
    "scripts/serve.mjs", "scripts/build-offline.py", "scripts/check-public.mjs",
    "scripts/test-engine.mjs", "scripts/export-public.py",
    "third_party/licenses/jiangnangame/LICENSE-CHINESE.md",
    "third_party/licenses/jiangnangame/LICENSE-ENGLISH.md",
)
ASSET_SUFFIXES = {".png", ".jpg", ".gif", ".mp3", ".js", ".json"}


def main():
    if OUTPUT.exists():
        raise SystemExit("dist/public already exists. Move it aside before exporting again.")
    # Fail rather than silently accepting a newly tracked private source file.
    subprocess.run(["node", "scripts/check-public.mjs"], cwd=ROOT, check=True)
    files = list(FILES)
    # Copy only Git-visible, audited assets. Ignored local references stay local.
    visible = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "assets/"],
        cwd=ROOT,
    ).decode().split("\0") if (ROOT / ".git").exists() else [
        p.relative_to(ROOT).as_posix() for p in (ROOT / "assets").iterdir() if p.is_file()
    ]
    for name in sorted(set(visible) - {""}):
        asset = Path(name)
        if len(asset.parts) != 2 or asset.suffix not in ASSET_SUFFIXES:
            raise SystemExit(f"Unrecognized public asset: {name}")
        files.append(name)
    for name in files:
        source = ROOT / name
        if source.is_symlink() or not source.is_file():
            raise SystemExit(f"Missing or unsafe public file: {name}")
    OUTPUT.parent.mkdir(exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".public-", dir=OUTPUT.parent))
    try:
        for name in files:
            target = staging / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        # Check the standalone copy, including links, without reading parent Git history.
        subprocess.run(["node", "scripts/check-public.mjs"], cwd=staging, check=True)
        staging.rename(OUTPUT)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    print(f"Exported {len(files)} files to dist/public (no Git history).")


if __name__ == "__main__":
    main()
