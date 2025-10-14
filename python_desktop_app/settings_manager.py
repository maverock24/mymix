"""
Settings manager for persisting user preferences.
Handles saving and loading application settings including file paths and preferences.
"""

import json
import os
from pathlib import Path


class SettingsManager:
    """Manages application settings persistence."""

    def __init__(self):
        # Store settings in user's home directory
        self.settings_dir = Path.home() / ".audiomixer"
        self.settings_file = self.settings_dir / "settings.json"

        # Default settings
        self.default_settings = {
            "auto_reload_files": True,
            "last_audiobook_path": None,
            "last_music_path": None,
            "last_audiobook_dir": str(Path.home()),
            "last_music_dir": str(Path.home()),
            "audiobook_speed": 1.0,
            "audiobook_volume": 0.0,
            "music_volume": -10.0,
        }

        # Ensure settings directory exists
        self._ensure_settings_dir()

    def _ensure_settings_dir(self):
        """Create settings directory if it doesn't exist."""
        try:
            self.settings_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            print(f"Warning: Could not create settings directory: {e}")

    def load_settings(self):
        """Load settings from file, or return defaults if file doesn't exist."""
        try:
            if self.settings_file.exists():
                with open(self.settings_file, 'r') as f:
                    settings = json.load(f)
                    # Merge with defaults to handle new settings in updates
                    return {**self.default_settings, **settings}
            else:
                return self.default_settings.copy()
        except Exception as e:
            print(f"Warning: Could not load settings: {e}")
            return self.default_settings.copy()

    def save_settings(self, settings):
        """Save settings to file."""
        try:
            with open(self.settings_file, 'w') as f:
                json.dump(settings, f, indent=2)
            return True
        except Exception as e:
            print(f"Warning: Could not save settings: {e}")
            return False

    def get_setting(self, key, default=None):
        """Get a specific setting value."""
        settings = self.load_settings()
        return settings.get(key, default)

    def set_setting(self, key, value):
        """Set a specific setting value and save."""
        settings = self.load_settings()
        settings[key] = value
        return self.save_settings(settings)

    def clear_file_paths(self):
        """Clear saved file paths (useful for reset)."""
        settings = self.load_settings()
        settings["last_audiobook_path"] = None
        settings["last_music_path"] = None
        return self.save_settings(settings)
