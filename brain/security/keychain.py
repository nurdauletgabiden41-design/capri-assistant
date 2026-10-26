"""Secure credential storage for Capri Brain using Windows Credential Manager."""

import os

import keyring

SERVICE_NAME = "CapriAssistant"
USERNAME = "openrouter_api_key"


def get_api_key() -> str | None:
    """Retrieve the OpenRouter API key from environment variable or Windows Credential Manager."""
    # 1. Environment variable override (useful for testing and CI)
    env_key = os.environ.get("OPENROUTER_API_KEY")
    if env_key and env_key.strip():
        return env_key.strip()

    # 2. Windows Credential Manager via keyring
    try:
        stored = keyring.get_password(SERVICE_NAME, USERNAME)
        if stored and stored.strip():
            return stored.strip()
    except Exception:
        # Avoid leaking errors containing sensitive info
        pass

    return None


def set_api_key(key: str) -> None:
    """Store the OpenRouter API key securely in Windows Credential Manager."""
    if not key or not key.strip():
        raise ValueError("Cannot set an empty API key")
    keyring.set_password(SERVICE_NAME, USERNAME, key.strip())


def delete_api_key() -> None:
    """Remove the OpenRouter API key from Windows Credential Manager."""
    try:
        keyring.delete_password(SERVICE_NAME, USERNAME)
    except Exception:
        pass
