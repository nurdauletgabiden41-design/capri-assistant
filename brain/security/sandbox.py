"""Path sandboxing and filesystem security controls for Capri Brain."""

import os
from pathlib import Path


class SandboxSecurityError(PermissionError):
    """Raised when a path or filesystem operation violates sandbox constraints."""
    pass


FORBIDDEN_NAME_PATTERNS = {
    ".env",
    ".git",
    ".ssh",
    "id_rsa",
    "id_ed25519",
    "id_ecdsa",
    "known_hosts",
    "credentials",
    "authorized_keys",
    "sam",
    "system",
    "security",
    "ntuser.dat",
}

FORBIDDEN_EXTENSIONS = {
    ".pem",
    ".pfx",
    ".p12",
    ".key",
}

FORBIDDEN_SYS_DIRS = [
    Path(os.environ.get("SystemRoot", r"C:\Windows")).resolve(),
    Path(os.environ.get("ProgramFiles", r"C:\Program Files")).resolve(),
    Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")).resolve(),
]


def get_default_allowed_dirs() -> list[Path]:
    """Returns canonical list of default directories accessible to Capri tools."""
    allowed: list[Path] = [
        Path.cwd().resolve(),
        (Path.home() / "Desktop").resolve(),
        (Path.home() / "Documents").resolve(),
        (Path.home() / "Downloads").resolve(),
    ]
    # Remove duplicates and nonexistent paths
    canonical: list[Path] = []
    for p in allowed:
        if p.exists() and p not in canonical:
            canonical.append(p)
    return canonical


def validate_path(
    path_input: str | Path,
    allowed_dirs: list[Path] | None = None,
    write: bool = False,
) -> Path:
    """Validates that a path is within the sandbox and does not target protected files."""
    if allowed_dirs is None:
        allowed_dirs = get_default_allowed_dirs()

    raw_path = Path(path_input)

    # Prevent explicit path traversal tricks
    if ".." in raw_path.parts:
        # Resolve to check if it tries to escape
        resolved = raw_path.resolve()
    else:
        resolved = raw_path.resolve()

    # Block access to critical Windows operating system directories
    for sys_dir in FORBIDDEN_SYS_DIRS:
        try:
            if resolved == sys_dir or resolved.is_relative_to(sys_dir):
                raise SandboxSecurityError(
                    f"Access denied: Path '{resolved}' points to protected system directory."
                )
        except (ValueError, TypeError):
            continue

    # Ensure path is strictly inside one of the allowed directories
    is_allowed = False
    for base in allowed_dirs:
        try:
            if resolved == base or resolved.is_relative_to(base):
                is_allowed = True
                break
        except (ValueError, TypeError):
            continue

    if not is_allowed:
        allowed_str = ", ".join(str(d) for d in allowed_dirs)
        raise SandboxSecurityError(
            f"Access denied: '{resolved}' is outside allowed directories: [{allowed_str}]."
        )

    # Check for forbidden sensitive file names and extensions
    lower_name = resolved.name.lower()
    if lower_name in FORBIDDEN_NAME_PATTERNS or lower_name.startswith(".env"):
        raise SandboxSecurityError(
            f"Access denied: '{resolved.name}' is a protected sensitive file."
        )

    for part in resolved.parts:
        if part.lower() in {".git", ".ssh", "node_modules" if write else ""}:
            raise SandboxSecurityError(
                f"Access denied: Directory '{part}' is restricted from modifications."
            )

    if resolved.suffix.lower() in FORBIDDEN_EXTENSIONS:
        raise SandboxSecurityError(
            f"Access denied: Certificate or private key file extension '{resolved.suffix}' is forbidden."
        )

    return resolved
