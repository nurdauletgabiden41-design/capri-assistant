# -*- mode: python ; coding: utf-8 -*-
import sys
from pathlib import Path

block_cipher = None

root_dir = Path(__file__).resolve().parent.parent if '__file__' in globals() else Path.cwd()
shared_schemas = (str(root_dir / 'shared' / 'schemas'), 'shared/schemas')

hiddenimports = [
    'websockets',
    'jsonschema',
    'keyring',
    'keyring.backends',
    'keyring.backends.Windows',
    'edge_tts',
    'faster_whisper',
    'ctranslate2',
    'numpy',
    'av',
]

datas = [
    shared_schemas,
]

a = Analysis(
    ['main.py'],
    pathex=[str(root_dir), str(root_dir / 'brain')],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'scipy', 'IPython'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='brain',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='brain',
)
