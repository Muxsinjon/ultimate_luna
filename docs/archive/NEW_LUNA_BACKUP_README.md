# LunaWindow — complete Milestone 1 backup

[Download the complete backup ZIP](https://github.com/Muxsinjon/new_luna/raw/refs/heads/main/LunaWindow-Milestone1-aeb54a6.zip)

This private repository contains a verified full backup: all project source, processing scripts, processed terrain assets, documentation, tests, fonts/licenses, full local Git history through `aeb54a6a892dedfa96138d008be8170d0382001f`, and the final recovery patch.

## Download and restore on Windows

1. Click the download link above while signed into GitHub with access to this repository. Alternatively, open the ZIP in the file list and choose **Download raw file**.
2. Right-click the downloaded ZIP → **Extract All**.
3. Open `LunaWindow-Milestone1/README-WINDOWS.txt`.
4. The full repository is in `LunaWindow-Milestone1/lunawindow/`. Keep its hidden `.git` folder, which contains the local history.
5. With Git for Windows installed, open PowerShell in that repository:

```powershell
git log -1 --oneline
git status
git fsck --full
```

Expected HEAD: `aeb54a6`; branch `feat/connecting-ridge-3d`; clean working tree.

The recovery patch is inside `RECOVERY/`. Do not apply it on top of the restored final repository: its changes are already present.

## Integrity

SHA-256:

```text
a6df4ad1ca4d62b9e906323cdaf3d9ee5d009d964c775dabb659a59d201e2ee4
```

```powershell
Get-FileHash .\LunaWindow-Milestone1-aeb54a6.zip -Algorithm SHA256
```

The ZIP passed CRC and extracted-file hash verification. A restored copy passed Git fsck, exact HEAD verification and clean working-tree checks.

Excluded: reinstallable dependencies/caches, virtual environments, raw NASA downloads and temporary/rebuildable outputs. All processed terrain assets needed to run the app are included.

The original `Muxsinjon/lunawindow` remote was not modified. WAC registration remains unverified/off by default; see the included acceptance report.
