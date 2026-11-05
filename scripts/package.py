"""Build a deterministic, installable XPI using only the Python standard library."""
from pathlib import Path
import json
import zipfile
root = Path(__file__).resolve().parents[1]
source = root / 'extension'
version = json.loads((source / 'manifest.json').read_text())['version']
out = root / 'dist' / f'Meetling-Thunderbird-{version}.xpi'
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob('*')):
        if file.is_file():
            info = zipfile.ZipInfo(file.relative_to(source).as_posix(), (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, file.read_bytes())
print(out)
