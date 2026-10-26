"""Desktop interaction tools: browser, application launch/close, media keys."""

import ctypes
import logging
import os
import subprocess
import sys
import webbrowser

from brain.tools.base import ToolResult

logger = logging.getLogger("capri.brain.tools.desktop")

# Known application shortcuts mapped to executable commands or URI schemes
APP_ALIASES: dict[str, str] = {
    "spotify": "spotify:",
    "chrome": "chrome.exe",
    "firefox": "firefox.exe",
    "edge": "msedge.exe",
    "notepad": "notepad.exe",
    "calc": "calc.exe",
    "calculator": "calc.exe",
    "code": "code",
    "vscode": "code",
    "terminal": "wt.exe",
    "powershell": "powershell.exe",
    "explorer": "explorer.exe",
}

CRITICAL_SYSTEM_PROCESSES: set[str] = {
    "explorer.exe",
    "python.exe",
    "electron.exe",
    "svchost.exe",
    "dwm.exe",
    "csrss.exe",
    "lsass.exe",
    "services.exe",
    "smss.exe",
    "winlogon.exe",
    "taskmgr.exe",
}

VK_MAP: dict[str, int] = {
    "play_pause": 0xB3,
    "next": 0xB0,
    "prev": 0xB1,
    "volume_mute": 0xAD,
    "mute": 0xAD,
    "volume_down": 0xAE,
    "volume_up": 0xAF,
}


async def open_url(url: str) -> ToolResult:
    """Opens a website in the default browser."""
    clean_url = url.strip()
    if not (clean_url.startswith("http://") or clean_url.startswith("https://")):
        return ToolResult(
            ok=False,
            error=f"Invalid URL '{url}'. Must start with http:// or https://",
        )

    try:
        webbrowser.open(clean_url)
        return ToolResult(ok=True, output=f"Opened URL: {clean_url}")
    except Exception as err:
        return ToolResult(ok=False, error=f"Failed to open URL: {err}")


async def open_app(name_or_path: str) -> ToolResult:
    """Launches an application by name alias or executable path."""
    target = name_or_path.strip().lower()
    command = APP_ALIASES.get(target, name_or_path.strip())

    try:
        if sys.platform == "win32":
            if command.endswith(":"):
                # Protocol scheme like spotify:
                os.startfile(command)
            else:
                subprocess.Popen(command, shell=True)
        else:
            subprocess.Popen([command], shell=True)

        return ToolResult(ok=True, output=f"Application launched: {name_or_path}")
    except Exception as err:
        return ToolResult(ok=False, error=f"Failed to launch '{name_or_path}': {err}")


async def close_app(name: str) -> ToolResult:
    """Closes a running application by process name (Requires User Approval)."""
    target = name.strip().lower()
    proc_name = target if target.endswith(".exe") else f"{target}.exe"

    if proc_name in CRITICAL_SYSTEM_PROCESSES:
        return ToolResult(
            ok=False,
            error=f"Access denied: '{proc_name}' is a protected system process and cannot be terminated.",
        )

    try:
        if sys.platform == "win32":
            res = subprocess.run(
                ["taskkill", "/IM", proc_name, "/F"],
                capture_output=True,
                text=True,
                check=False,
            )
            if res.returncode == 0:
                return ToolResult(ok=True, output=f"Terminated process '{proc_name}' successfully.")
            return ToolResult(
                ok=False,
                error=res.stderr.strip() or f"Process '{proc_name}' not found or could not be closed.",
            )
        else:
            res = subprocess.run(["pkill", "-f", target], capture_output=True, text=True, check=False)
            return ToolResult(ok=res.returncode == 0, output=f"Closed {name}")
    except Exception as err:
        return ToolResult(ok=False, error=f"Error closing app: {err}")


async def media_control(action: str) -> ToolResult:
    """Sends global media keyboard events (play_pause, next, prev, volume_up, volume_down, mute)."""
    act = action.strip().lower()
    if act not in VK_MAP:
        valid_acts = ", ".join(VK_MAP.keys())
        return ToolResult(ok=False, error=f"Unknown media action '{action}'. Valid: {valid_acts}")

    vk_code = VK_MAP[act]

    if sys.platform == "win32":
        try:
            # keybd_event(bVk, bScan, dwFlags, dwExtraInfo)
            KEYEVENTF_KEYUP = 0x0002
            ctypes.windll.user32.keybd_event(vk_code, 0, 0, 0)
            ctypes.windll.user32.keybd_event(vk_code, 0, KEYEVENTF_KEYUP, 0)
            return ToolResult(ok=True, output=f"Media action '{act}' triggered.")
        except Exception as err:
            return ToolResult(ok=False, error=f"Media key event failed: {err}")
    else:
        return ToolResult(ok=True, output=f"Media action '{act}' simulated.")
