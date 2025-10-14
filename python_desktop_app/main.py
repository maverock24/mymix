"""
Audiobook & Background Music Mixer - Desktop Application
Mix audiobooks with background music with full control over speed, volume, and rendering.
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import os
import threading
from audio_processor import AudioProcessor
from settings_manager import SettingsManager

# Try to import pyperclip, but don't fail if it's not available
try:
    import pyperclip
    HAS_PYPERCLIP = True
except ImportError:
    HAS_PYPERCLIP = False


class AudioMixerApp:
    """Main application GUI."""

    def __init__(self, root):
        self.root = root
        self.root.title("Audiobook & Music Mixer")
        self.root.geometry("750x500")

        # Make window fixed size (non-resizable)
        self.root.resizable(False, False)

        # Initialize settings manager
        self.settings = SettingsManager()

        # Load saved settings
        self.saved_settings = self.settings.load_settings()

        # Initialize audio processor
        self.processor = AudioProcessor()

        # File paths
        self.audiobook_path = None
        self.audiobook_folder = None  # Path to folder containing multiple audiobook files
        self.audiobook_files = []  # List of audiobook files when folder is selected
        self.music_path = None

        # Remember last used directory for file dialogs (load from settings)
        self.last_audiobook_dir = self.saved_settings.get("last_audiobook_dir", os.path.expanduser("~"))
        self.last_music_dir = self.saved_settings.get("last_music_dir", os.path.expanduser("~"))

        # Create GUI
        self.create_widgets()

        # Apply loaded settings to processor
        self.processor.set_audiobook_speed(self.speed_var.get())
        self.processor.set_audiobook_volume(self.audiobook_volume_var.get())
        self.processor.set_music_volume(self.music_volume_var.get())

        # Track seeking state
        self.is_seeking = False

        # Debounce timers for settings changes
        self.settings_change_timer = None

        # Track if user is actively adjusting speed slider
        self.is_adjusting_speed = False
        self.speed_adjust_timer = None

        # Debounce timer for saving settings
        self.save_settings_timer = None

        # Start position update timer
        self.update_position_display()

        # Auto-reload files if enabled
        self.auto_reload_files()

    def create_widgets(self):
        """Create all GUI widgets."""

        # Main container
        main_frame = ttk.Frame(self.root, padding="5")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N))

        self.root.columnconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)

        # ========== FILE SELECTION SECTION (2 columns) ==========
        file_frame = ttk.LabelFrame(main_frame, text="Audio Files", padding="8")
        file_frame.grid(row=0, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(0, 5))
        file_frame.columnconfigure(1, weight=1)
        file_frame.columnconfigure(3, weight=1)

        # Audiobook selection (left column)
        ttk.Label(file_frame, text="Audiobook:", font=("Arial", 9, "bold")).grid(
            row=0, column=0, sticky=tk.W, padx=(0, 5)
        )

        # Audiobook buttons container
        audiobook_btn_frame = ttk.Frame(file_frame)
        audiobook_btn_frame.grid(row=0, column=1, sticky=tk.W, padx=(0, 10))

        ttk.Button(audiobook_btn_frame, text="File...", command=self.select_audiobook, width=7).pack(side=tk.LEFT, padx=(0, 2))
        ttk.Button(audiobook_btn_frame, text="Folder...", command=self.select_audiobook_folder, width=7).pack(side=tk.LEFT)

        # Background music selection (right column)
        ttk.Label(file_frame, text="Music:", font=("Arial", 9, "bold")).grid(
            row=0, column=2, sticky=tk.W, padx=(0, 5)
        )
        ttk.Button(file_frame, text="Browse...", command=self.select_music, width=10).grid(
            row=0, column=3, sticky=tk.W
        )

        # Audiobook info (left column)
        self.audiobook_label = ttk.Label(file_frame, text="No file selected", foreground="gray", font=("Arial", 8))
        self.audiobook_label.grid(row=1, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(2, 0), padx=(0, 10))

        self.audiobook_info_label = ttk.Label(file_frame, text="", foreground="blue", font=("Arial", 8))
        self.audiobook_info_label.grid(row=2, column=0, columnspan=2, sticky=tk.W, padx=(0, 10))

        # Music info (right column)
        self.music_label = ttk.Label(file_frame, text="No file selected", foreground="gray", font=("Arial", 8))
        self.music_label.grid(row=1, column=2, columnspan=2, sticky=(tk.W, tk.E), pady=(2, 0))

        self.music_info_label = ttk.Label(file_frame, text="", foreground="blue", font=("Arial", 8))
        self.music_info_label.grid(row=2, column=2, columnspan=2, sticky=tk.W)

        # Progress bars (hidden by default)
        self.audiobook_progress_var = tk.DoubleVar()
        self.audiobook_progress_bar = ttk.Progressbar(
            file_frame, variable=self.audiobook_progress_var, maximum=100,
            mode='indeterminate', length=100
        )
        self.audiobook_progress_bar.grid(row=3, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(2, 0), padx=(0, 10))
        self.audiobook_progress_bar.grid_remove()

        self.audiobook_progress_label = ttk.Label(file_frame, text="", foreground="orange", font=("Arial", 8))
        self.audiobook_progress_label.grid(row=4, column=0, columnspan=2, sticky=tk.W, padx=(0, 10))

        self.music_progress_var = tk.DoubleVar()
        self.music_progress_bar = ttk.Progressbar(
            file_frame, variable=self.music_progress_var, maximum=100,
            mode='indeterminate', length=100
        )
        self.music_progress_bar.grid(row=3, column=2, columnspan=2, sticky=(tk.W, tk.E), pady=(2, 0))
        self.music_progress_bar.grid_remove()

        self.music_progress_label = ttk.Label(file_frame, text="", foreground="orange", font=("Arial", 8))
        self.music_progress_label.grid(row=4, column=2, columnspan=2, sticky=tk.W)

        # ========== SETTINGS SECTION (Left column) ==========
        settings_frame = ttk.LabelFrame(main_frame, text="Mix Settings", padding="8")
        settings_frame.grid(row=1, column=0, sticky=(tk.W, tk.E, tk.N), pady=(0, 5), padx=(0, 3))
        settings_frame.columnconfigure(0, weight=1)

        # Auto-reload files checkbox
        self.auto_reload_var = tk.BooleanVar(value=self.saved_settings.get("auto_reload_files", True))
        auto_reload_check = ttk.Checkbutton(
            settings_frame,
            text="Remember and reload files on startup",
            variable=self.auto_reload_var,
            command=self.on_auto_reload_toggle
        )
        auto_reload_check.grid(row=0, column=0, sticky=tk.W, pady=(0, 8))

        # Speed
        ttk.Label(settings_frame, text="Speed:", font=("Arial", 9, "bold")).grid(
            row=1, column=0, sticky=tk.W, pady=(0, 2)
        )
        speed_container = ttk.Frame(settings_frame)
        speed_container.grid(row=2, column=0, sticky=(tk.W, tk.E), pady=(0, 5))
        speed_container.columnconfigure(0, weight=1)

        self.speed_var = tk.DoubleVar(value=self.saved_settings.get("audiobook_speed", 1.0))
        self.speed_slider = ttk.Scale(
            speed_container, from_=0.5, to=2.0, variable=self.speed_var,
            orient=tk.HORIZONTAL, command=self.on_speed_change
        )
        self.speed_slider.grid(row=0, column=0, sticky=(tk.W, tk.E), padx=(0, 5))
        # Bind mouse events to track when user is actively dragging
        self.speed_slider.bind("<ButtonPress-1>", self.on_speed_slider_press)
        self.speed_slider.bind("<ButtonRelease-1>", self.on_speed_slider_release)
        self.speed_label = ttk.Label(speed_container, text=f"{self.speed_var.get():.2f}x", width=5, font=("Arial", 8))
        self.speed_label.grid(row=0, column=1)

        # Audiobook Volume
        ttk.Label(settings_frame, text="Audiobook Vol:", font=("Arial", 9, "bold")).grid(
            row=3, column=0, sticky=tk.W, pady=(0, 2)
        )
        audiobook_vol_container = ttk.Frame(settings_frame)
        audiobook_vol_container.grid(row=4, column=0, sticky=(tk.W, tk.E), pady=(0, 5))
        audiobook_vol_container.columnconfigure(0, weight=1)

        self.audiobook_volume_var = tk.DoubleVar(value=self.saved_settings.get("audiobook_volume", 0))
        self.audiobook_volume_slider = ttk.Scale(
            audiobook_vol_container, from_=-20, to=20, variable=self.audiobook_volume_var,
            orient=tk.HORIZONTAL, command=self.on_audiobook_volume_change
        )
        self.audiobook_volume_slider.grid(row=0, column=0, sticky=(tk.W, tk.E), padx=(0, 5))
        self.audiobook_volume_label = ttk.Label(audiobook_vol_container, text=f"{self.audiobook_volume_var.get():+.0f} dB", width=5, font=("Arial", 8))
        self.audiobook_volume_label.grid(row=0, column=1)

        # Music Volume
        ttk.Label(settings_frame, text="Music Vol:", font=("Arial", 9, "bold")).grid(
            row=5, column=0, sticky=tk.W, pady=(0, 2)
        )
        music_vol_container = ttk.Frame(settings_frame)
        music_vol_container.grid(row=6, column=0, sticky=(tk.W, tk.E))
        music_vol_container.columnconfigure(0, weight=1)

        self.music_volume_var = tk.DoubleVar(value=self.saved_settings.get("music_volume", -10))
        self.music_volume_slider = ttk.Scale(
            music_vol_container, from_=-30, to=10, variable=self.music_volume_var,
            orient=tk.HORIZONTAL, command=self.on_music_volume_change
        )
        self.music_volume_slider.grid(row=0, column=0, sticky=(tk.W, tk.E), padx=(0, 5))
        self.music_volume_label = ttk.Label(music_vol_container, text=f"{self.music_volume_var.get():+.0f} dB", width=5, font=("Arial", 8))
        self.music_volume_label.grid(row=0, column=1)

        # ========== PLAYBACK & EXPORT SECTION (Right column) ==========
        right_frame = ttk.Frame(main_frame)
        right_frame.grid(row=1, column=1, sticky=(tk.W, tk.E, tk.N), pady=(0, 5), padx=(3, 0))
        right_frame.columnconfigure(0, weight=1)
        right_frame.rowconfigure(0, weight=0)
        right_frame.rowconfigure(1, weight=0)

        # Preview section
        preview_frame = ttk.LabelFrame(right_frame, text="Playback", padding="8")
        preview_frame.grid(row=0, column=0, sticky=(tk.W, tk.E), pady=(0, 5))
        preview_frame.columnconfigure(0, weight=1)

        # Seek slider
        ttk.Label(preview_frame, text="Position:", font=("Arial", 9, "bold")).grid(
            row=0, column=0, sticky=tk.W, pady=(0, 2)
        )

        seek_container = ttk.Frame(preview_frame)
        seek_container.grid(row=1, column=0, sticky=(tk.W, tk.E), pady=(0, 8))
        seek_container.columnconfigure(0, weight=1)

        self.seek_var = tk.DoubleVar(value=0)
        self.seek_slider = ttk.Scale(
            seek_container, from_=0, to=100, variable=self.seek_var, orient=tk.HORIZONTAL
        )
        self.seek_slider.grid(row=0, column=0, sticky=(tk.W, tk.E), padx=(0, 5))
        self.seek_slider.config(state='disabled')
        self.seek_slider.bind("<ButtonPress-1>", self.on_seek_start)
        self.seek_slider.bind("<ButtonRelease-1>", self.on_seek_end)

        self.seek_label = ttk.Label(seek_container, text="0:00 / 0:00", width=10, font=("Arial", 8))
        self.seek_label.grid(row=0, column=1)

        # Playback buttons
        playback_btn_frame = ttk.Frame(preview_frame)
        playback_btn_frame.grid(row=2, column=0, sticky=(tk.W, tk.E), pady=(0, 8))

        self.play_pause_btn = ttk.Button(
            playback_btn_frame, text="▶ Play", command=self.toggle_play_pause, width=12
        )
        self.play_pause_btn.pack(side=tk.LEFT, padx=(0, 5))

        ttk.Button(playback_btn_frame, text="■ Stop", command=self.stop_preview, width=8).pack(side=tk.LEFT)

        # Preview status
        preview_status_frame = ttk.Frame(preview_frame)
        preview_status_frame.grid(row=3, column=0, sticky=(tk.W, tk.E))

        self.preview_label = ttk.Label(preview_status_frame, text="", foreground="green", font=("Arial", 8))
        self.preview_label.pack(side=tk.LEFT, fill=tk.X, expand=True)

        self.copy_error_btn = ttk.Button(
            preview_status_frame, text="Copy", command=self.copy_error_message, width=6
        )
        self.last_error_message = ""

        # Render section
        render_frame = ttk.LabelFrame(right_frame, text="Export", padding="8")
        render_frame.grid(row=1, column=0, sticky=(tk.W, tk.E))
        render_frame.columnconfigure(0, weight=1)

        ttk.Button(
            render_frame, text="Render to MP3", command=self.render_audio, width=20
        ).grid(row=0, column=0, pady=(0, 5))

        self.progress_var = tk.DoubleVar()
        self.progress_bar = ttk.Progressbar(
            render_frame, variable=self.progress_var, maximum=100, mode='determinate'
        )
        self.progress_bar.grid(row=1, column=0, sticky=(tk.W, tk.E), pady=(0, 3))

        # Fixed width label to prevent border resizing
        self.progress_label = ttk.Label(render_frame, text="", font=("Arial", 8), width=55, anchor='w')
        self.progress_label.grid(row=2, column=0, sticky=tk.W)

        # ========== STATUS BAR ==========
        status_frame = ttk.Frame(main_frame)
        status_frame.grid(row=2, column=0, columnspan=2, sticky=(tk.W, tk.E))

        self.status_label = ttk.Label(
            status_frame, text="Ready. Load audiobook and music to begin.",
            relief=tk.SUNKEN, font=("Arial", 8)
        )
        self.status_label.pack(side=tk.LEFT, fill=tk.X, expand=True, pady=(5, 0))

        # Global copy error button (always visible when there's an error)
        self.global_copy_btn = ttk.Button(
            status_frame, text="📋 Copy Last Error", command=self.copy_error_message, width=16
        )
        # Hidden by default

    def select_audiobook(self):
        """Open file dialog to select audiobook."""
        file_path = filedialog.askopenfilename(
            title="Select Audiobook",
            initialdir=self.last_audiobook_dir,
            filetypes=[("MP3 Files", "*.mp3"), ("All Files", "*.*")]
        )

        if file_path:
            self.audiobook_path = file_path
            # Remember the directory for next time
            self.last_audiobook_dir = os.path.dirname(file_path)

            # Show loading indicator
            self.audiobook_progress_bar.grid()
            self.audiobook_progress_bar.start(10)
            self.audiobook_label.config(text="Loading...", foreground="orange")
            self.audiobook_progress_label.config(text="Loading audiobook...")

            def progress_callback(percent, message):
                """Update progress indicator."""
                self.root.after(0, lambda: self.audiobook_progress_label.config(text=message))

            def load_thread():
                """Load in background thread."""
                success, message = self.processor.load_audiobook(file_path, progress_callback)

                def update_ui():
                    # Stop and hide progress bar
                    self.audiobook_progress_bar.stop()
                    self.audiobook_progress_bar.grid_remove()
                    self.audiobook_progress_label.config(text="")

                    if success:
                        self.audiobook_label.config(
                            text=os.path.basename(file_path), foreground="black"
                        )
                        self.audiobook_info_label.config(text=self.processor.get_audiobook_info())
                        self.status_label.config(text=message)
                        self.update_seek_slider()
                        # Save settings if auto-reload is enabled
                        if self.auto_reload_var.get():
                            self.save_current_settings()
                    else:
                        self.audiobook_label.config(text="Error loading file", foreground="red")
                        messagebox.showerror("Error", message)

                self.root.after(0, update_ui)

            threading.Thread(target=load_thread, daemon=True).start()

    def select_audiobook_folder(self):
        """Open folder dialog to select audiobook folder with multiple files."""
        folder_path = filedialog.askdirectory(
            title="Select Audiobook Folder",
            initialdir=self.last_audiobook_dir
        )

        if folder_path:
            # Clear single file path
            self.audiobook_path = None
            self.audiobook_folder = folder_path
            self.last_audiobook_dir = folder_path

            # Find all MP3 files in the folder
            import glob
            mp3_files = sorted(glob.glob(os.path.join(folder_path, "*.mp3")))

            if not mp3_files:
                messagebox.showwarning(
                    "No MP3 Files",
                    "No MP3 files found in the selected folder."
                )
                return

            self.audiobook_files = mp3_files

            # Show loading indicator
            self.audiobook_progress_bar.grid()
            self.audiobook_progress_bar.start(10)
            self.audiobook_label.config(text=f"Loading {len(mp3_files)} files...", foreground="orange")
            self.audiobook_progress_label.config(text="Analyzing audiobook files...")

            def progress_callback(percent, message):
                """Update progress indicator."""
                self.root.after(0, lambda: self.audiobook_progress_label.config(text=message))

            def load_thread():
                """Load in background thread."""
                success, message = self.processor.load_audiobook_folder(mp3_files, progress_callback)

                def update_ui():
                    # Stop and hide progress bar
                    self.audiobook_progress_bar.stop()
                    self.audiobook_progress_bar.grid_remove()
                    self.audiobook_progress_label.config(text="")

                    if success:
                        self.audiobook_label.config(
                            text=f"{len(mp3_files)} files from {os.path.basename(folder_path)}",
                            foreground="black"
                        )
                        self.audiobook_info_label.config(text=self.processor.get_audiobook_info())
                        self.status_label.config(text=message)
                        self.update_seek_slider()
                        # Save settings if auto-reload is enabled
                        if self.auto_reload_var.get():
                            self.save_current_settings()
                    else:
                        self.audiobook_label.config(text="Error loading folder", foreground="red")
                        messagebox.showerror("Error", message)

                self.root.after(0, update_ui)

            threading.Thread(target=load_thread, daemon=True).start()

    def select_music(self):
        """Open file dialog to select background music."""
        file_path = filedialog.askopenfilename(
            title="Select Background Music",
            initialdir=self.last_music_dir,
            filetypes=[("MP3 Files", "*.mp3"), ("All Files", "*.*")]
        )

        if file_path:
            self.music_path = file_path
            # Remember the directory for next time
            self.last_music_dir = os.path.dirname(file_path)

            # Show loading indicator
            self.music_progress_bar.grid()
            self.music_progress_bar.start(10)
            self.music_label.config(text="Loading...", foreground="orange")
            self.music_progress_label.config(text="Loading music...")

            def progress_callback(percent, message):
                """Update progress indicator."""
                self.root.after(0, lambda: self.music_progress_label.config(text=message))

            def load_thread():
                """Load in background thread."""
                success, message = self.processor.load_background_music(file_path, progress_callback)

                def update_ui():
                    # Stop and hide progress bar
                    self.music_progress_bar.stop()
                    self.music_progress_bar.grid_remove()
                    self.music_progress_label.config(text="")

                    if success:
                        self.music_label.config(text=os.path.basename(file_path), foreground="black")
                        self.music_info_label.config(text=self.processor.get_music_info())
                        self.status_label.config(text=message)
                        self.update_seek_slider()
                        # Save settings if auto-reload is enabled
                        if self.auto_reload_var.get():
                            self.save_current_settings()
                    else:
                        self.music_label.config(text="Error loading file", foreground="red")
                        messagebox.showerror("Error", message)

                self.root.after(0, update_ui)

            threading.Thread(target=load_thread, daemon=True).start()

    def on_auto_reload_toggle(self):
        """Handle toggle of auto-reload files checkbox."""
        auto_reload_enabled = self.auto_reload_var.get()
        self.settings.set_setting("auto_reload_files", auto_reload_enabled)

        if not auto_reload_enabled:
            # If user disables auto-reload, clear saved file paths
            self.settings.clear_file_paths()
            self.status_label.config(text="Auto-reload disabled. Previous files cleared.")
        else:
            # If user enables auto-reload, save current files if any
            self.save_current_settings()
            self.status_label.config(text="Auto-reload enabled. Current files will be remembered.")

    def save_current_settings(self):
        """Save current settings including file paths."""
        settings_dict = {
            "auto_reload_files": self.auto_reload_var.get(),
            "last_audiobook_path": self.audiobook_path,
            "last_music_path": self.music_path,
            "last_audiobook_dir": self.last_audiobook_dir,
            "last_music_dir": self.last_music_dir,
            "audiobook_speed": self.speed_var.get(),
            "audiobook_volume": self.audiobook_volume_var.get(),
            "music_volume": self.music_volume_var.get(),
        }
        self.settings.save_settings(settings_dict)

    def schedule_save_settings(self):
        """Schedule settings save with debouncing to avoid excessive writes."""
        if not self.auto_reload_var.get():
            return

        # Cancel previous timer if exists
        if self.save_settings_timer:
            self.root.after_cancel(self.save_settings_timer)

        # Schedule new timer (2000ms delay to batch multiple changes)
        self.save_settings_timer = self.root.after(2000, self.save_current_settings)

    def auto_reload_files(self):
        """Auto-reload previously loaded files if the feature is enabled."""
        saved_settings = self.settings.load_settings()

        # Only reload if feature is enabled
        if not saved_settings.get("auto_reload_files", True):
            return

        audiobook_path = saved_settings.get("last_audiobook_path")
        music_path = saved_settings.get("last_music_path")

        # Check if both files exist
        if audiobook_path and os.path.exists(audiobook_path):
            self.status_label.config(text="Reloading audiobook from previous session...")
            self.audiobook_path = audiobook_path
            self.last_audiobook_dir = os.path.dirname(audiobook_path)

            # Load in background
            def load_audiobook():
                success, message = self.processor.load_audiobook(audiobook_path)
                def update_ui():
                    if success:
                        self.audiobook_label.config(text=os.path.basename(audiobook_path), foreground="black")
                        self.audiobook_info_label.config(text=self.processor.get_audiobook_info())
                        self.update_seek_slider()
                    else:
                        self.audiobook_label.config(text="Error reloading file", foreground="red")
                self.root.after(0, update_ui)

            threading.Thread(target=load_audiobook, daemon=True).start()

        if music_path and os.path.exists(music_path):
            self.status_label.config(text="Reloading music from previous session...")
            self.music_path = music_path
            self.last_music_dir = os.path.dirname(music_path)

            # Load in background
            def load_music():
                success, message = self.processor.load_background_music(music_path)
                def update_ui():
                    if success:
                        self.music_label.config(text=os.path.basename(music_path), foreground="black")
                        self.music_info_label.config(text=self.processor.get_music_info())
                        self.update_seek_slider()
                        self.status_label.config(text="Previous files reloaded successfully!")
                    else:
                        self.music_label.config(text="Error reloading file", foreground="red")
                self.root.after(0, update_ui)

            threading.Thread(target=load_music, daemon=True).start()

        # If both files were loaded, show success message after a delay
        if audiobook_path and music_path and os.path.exists(audiobook_path) and os.path.exists(music_path):
            self.root.after(2000, lambda: self.status_label.config(text="Ready. Previous session restored."))

    def _apply_settings_change(self):
        """Apply settings changes during playback (called after debounce delay)."""
        if self.processor.is_playing:
            current_pos = self.processor.get_playback_position()
            # Restart from current position with new settings
            threading.Thread(target=lambda: self.processor.play_mix(current_pos), daemon=True).start()

    def _schedule_settings_change(self):
        """Schedule settings change with debouncing to avoid too many restarts."""
        # Cancel previous timer if exists
        if self.settings_change_timer:
            self.root.after_cancel(self.settings_change_timer)

        # Schedule new timer (1000ms delay for smoother experience)
        self.settings_change_timer = self.root.after(1000, self._apply_settings_change)

    def on_speed_slider_press(self, event):
        """Handle when user presses mouse button on speed slider."""
        self.is_adjusting_speed = True

    def on_speed_slider_release(self, event):
        """Handle when user releases mouse button on speed slider."""
        self.is_adjusting_speed = False
        # Apply the final speed change after user stops dragging
        if self.processor.is_playing:
            # Cancel any pending timer
            if self.speed_adjust_timer:
                self.root.after_cancel(self.speed_adjust_timer)
            # Apply after short delay
            self.speed_adjust_timer = self.root.after(800, self._apply_settings_change)

    def on_speed_change(self, value):
        """Handle speed slider change."""
        speed = float(value)
        self.speed_label.config(text=f"{speed:.2f}x")
        self.processor.set_audiobook_speed(speed)

        # Update audiobook info if loaded or path available or multiple files
        if self.processor.audiobook or self.processor.audiobook_path or self.processor.audiobook_files:
            self.audiobook_info_label.config(text=self.processor.get_audiobook_info())
            self.update_seek_slider()  # Update duration display

        # Schedule settings save
        self.schedule_save_settings()

        # Only schedule restart if user has stopped dragging
        # This prevents constant restarts while dragging the slider
        if self.processor.is_playing and not self.is_adjusting_speed:
            # If user is using keyboard or clicking specific values, apply change
            if self.speed_adjust_timer:
                self.root.after_cancel(self.speed_adjust_timer)
            self.speed_adjust_timer = self.root.after(1000, self._apply_settings_change)

    def on_audiobook_volume_change(self, value):
        """Handle audiobook volume slider change."""
        volume = float(value)
        self.audiobook_volume_label.config(text=f"{volume:+.0f} dB")
        self.processor.set_audiobook_volume(volume)

        # Schedule settings save
        self.schedule_save_settings()

        # Volume changes are now applied in real-time via pygame mixer
        # No need to restart playback!

    def on_music_volume_change(self, value):
        """Handle music volume slider change."""
        volume = float(value)
        self.music_volume_label.config(text=f"{volume:+.0f} dB")
        self.processor.set_music_volume(volume)

        # Schedule settings save
        self.schedule_save_settings()

        # Volume changes are now applied in real-time via pygame mixer
        # No need to restart playback!

    def format_time(self, seconds):
        """Format seconds into MM:SS format."""
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{minutes}:{secs:02d}"

    def update_seek_slider(self):
        """Update the seek slider range and enable it."""
        # Enable if we have either loaded files OR file paths (streaming mode) OR multiple files
        has_audiobook = self.processor.audiobook or self.processor.audiobook_path or self.processor.audiobook_files
        has_music = self.processor.background_music or self.processor.music_path

        if has_audiobook and has_music:
            duration = self.processor.get_mixed_duration()
            self.seek_slider.config(to=duration, state='normal')
            current_pos = self.seek_var.get()
            self.seek_label.config(text=f"{self.format_time(current_pos)} / {self.format_time(duration)}")
        else:
            self.seek_slider.config(state='disabled')
            self.seek_label.config(text="0:00 / 0:00")

    def on_seek_start(self, event):
        """Handle when user starts dragging the seek slider."""
        self.is_seeking = True

    def on_seek_end(self, event):
        """Handle when user releases the seek slider - actually perform the seek."""
        self.is_seeking = False
        position = self.seek_var.get()

        # If playing, seek to the new position
        if self.processor.is_playing:
            success, message = self.processor.seek_to_position(position)
            if success:
                self.preview_label.config(text=message)

    def update_position_display(self):
        """Update the seek slider position during playback."""
        try:
            # Only update if playing and not currently seeking
            if self.processor.is_playing and not self.is_seeking:
                current_pos = self.processor.get_playback_position()
                duration = self.processor.get_mixed_duration()

                # Update slider and label
                if duration > 0 and current_pos <= duration:
                    self.seek_var.set(current_pos)
                    self.seek_label.config(text=f"{self.format_time(current_pos)} / {self.format_time(duration)}")

                # Check if playback finished
                if current_pos >= duration and duration > 0:
                    self.play_pause_btn.config(text="▶ Play")
                    self.processor.is_playing = False

            elif not self.processor.is_playing and not self.is_seeking:
                # Update label even when not playing (less frequently)
                if self.processor.audiobook or self.processor.audiobook_path or self.processor.audiobook_files:
                    current_pos = self.seek_var.get()
                    duration = self.processor.get_mixed_duration()
                    self.seek_label.config(text=f"{self.format_time(current_pos)} / {self.format_time(duration)}")

        except Exception:
            pass

        # Schedule next update - use different intervals based on playback state
        # 250ms when playing (4 updates/sec is smooth enough and reduces CPU)
        # 500ms when not playing (saves CPU when idle)
        update_interval = 250 if self.processor.is_playing else 500
        self.root.after(update_interval, self.update_position_display)

    def toggle_play_pause(self):
        """Toggle between play and pause for full mix playback."""
        # Check if we have files (either loaded or paths for streaming or multiple files)
        has_audiobook = self.processor.audiobook or self.processor.audiobook_path or self.processor.audiobook_files
        has_music = self.processor.background_music or self.processor.music_path

        if not has_audiobook or not has_music:
            messagebox.showwarning(
                "Missing Files",
                "Please load both audiobook and background music first."
            )
            return

        # Check if audio is currently playing
        if self.processor.is_audio_playing():
            # Pause
            success, message = self.processor.pause_playback()
            if success:
                self.play_pause_btn.config(text="▶ Resume")
                self.preview_label.config(text=message)
                self.status_label.config(text=message)
        elif self.processor.is_playing:
            # Resume from pause
            success, message = self.processor.resume_playback()
            if success:
                self.play_pause_btn.config(text="⏸ Pause")
                self.preview_label.config(text=message)
                self.status_label.config(text=message)
        else:
            # Start new playback from seek position
            start_position = self.seek_var.get()
            self.preview_label.config(text=f"Preparing playback from {self.format_time(start_position)}...")
            self.status_label.config(text="Generating mixed audio...")
            self.play_pause_btn.config(text="⏸ Pause")

            def play_thread():
                success, message = self.processor.play_mix(start_position)

                def update_ui():
                    if success:
                        self.preview_label.config(text=message, foreground="green")
                        self.status_label.config(text=message)
                        self.copy_error_btn.pack_forget()
                        self.global_copy_btn.pack_forget()
                        self.last_error_message = ""
                    else:
                        self.preview_label.config(text=message, foreground="red")
                        self.status_label.config(text="Playback failed")
                        self.play_pause_btn.config(text="▶ Play")
                        self.last_error_message = f"Playback Error: {message}"
                        self.copy_error_btn.pack(side=tk.RIGHT, padx=(5, 0))
                        self.global_copy_btn.pack(side=tk.RIGHT, padx=(5, 0))

                self.root.after(0, update_ui)

            threading.Thread(target=play_thread, daemon=True).start()

    def preview_at_position(self, duration):
        """Preview audio from the current seek position."""
        # Check if we have files (either loaded or paths for streaming or multiple files)
        has_audiobook = self.processor.audiobook or self.processor.audiobook_path or self.processor.audiobook_files
        has_music = self.processor.background_music or self.processor.music_path

        if not has_audiobook or not has_music:
            messagebox.showwarning(
                "Missing Files",
                "Please load both audiobook and background music first."
            )
            return

        start_position = self.seek_var.get()
        self.preview_label.config(text=f"Preparing {duration}s preview from {self.format_time(start_position)}...")
        self.status_label.config(text="Generating preview...")

        def preview_thread():
            success, message = self.processor.preview_mix(duration, start_position)

            def update_ui():
                if success:
                    self.preview_label.config(text=message, foreground="green")
                    self.status_label.config(text=message)
                    self.copy_error_btn.pack_forget()
                    self.global_copy_btn.pack_forget()
                    self.last_error_message = ""
                else:
                    self.preview_label.config(text=message, foreground="red")
                    self.status_label.config(text="Preview failed")
                    self.last_error_message = f"Preview Error: {message}"
                    self.copy_error_btn.pack(side=tk.RIGHT, padx=(5, 0))
                    self.global_copy_btn.pack(side=tk.RIGHT, padx=(5, 0))

                self.play_pause_btn.config(text="▶ Play")

            self.root.after(0, update_ui)

        threading.Thread(target=preview_thread, daemon=True).start()

    def copy_error_message(self):
        """Copy the last error message to clipboard."""
        if self.last_error_message:
            try:
                if HAS_PYPERCLIP:
                    # Try using pyperclip first (works better cross-platform)
                    pyperclip.copy(self.last_error_message)
                else:
                    # Fallback to tkinter clipboard
                    self.root.clipboard_clear()
                    self.root.clipboard_append(self.last_error_message)
                    self.root.update()
                self.status_label.config(text="Error message copied to clipboard!")
            except Exception as e:
                # If copy fails, show the error in a dialog so user can manually copy
                messagebox.showinfo("Error Message", self.last_error_message)

    def stop_preview(self):
        """Stop the current preview playback."""
        success, message = self.processor.stop_playback()
        self.preview_label.config(text=message, foreground="green")
        self.status_label.config(text=message)
        self.play_pause_btn.config(text="▶ Play")
        self.copy_error_btn.pack_forget()
        self.global_copy_btn.pack_forget()
        self.last_error_message = ""

    def render_audio(self):
        """Render the mixed audio to a file."""
        # Check if we have files (either loaded or paths for streaming or multiple files)
        has_audiobook = self.processor.audiobook or self.processor.audiobook_path or self.processor.audiobook_files
        has_music = self.processor.background_music or self.processor.music_path

        if not has_audiobook or not has_music:
            messagebox.showwarning(
                "Missing Files",
                "Please load both audiobook and background music first."
            )
            return

        # Ask user where to save (use last audiobook directory as default)
        output_path = filedialog.asksaveasfilename(
            title="Save Mixed Audio",
            initialdir=self.last_audiobook_dir,
            defaultextension=".mp3",
            filetypes=[("MP3 Files", "*.mp3"), ("All Files", "*.*")]
        )

        if not output_path:
            return

        # Reset progress
        self.progress_var.set(0)
        self.progress_label.config(text="Starting render...")

        def progress_callback(percent, status):
            """Update progress bar and label."""
            self.root.after(0, lambda: self.progress_var.set(percent))
            self.root.after(0, lambda: self.progress_label.config(text=status))

        def render_thread():
            """Render in a separate thread to avoid blocking UI."""
            success, message = self.processor.render_to_file(output_path, progress_callback)

            def update_ui():
                if success:
                    messagebox.showinfo("Success", message)
                    self.status_label.config(text="Render complete!")
                    self.progress_label.config(text="")
                    self.global_copy_btn.pack_forget()
                    self.last_error_message = ""
                else:
                    # Show error in messagebox and store it
                    messagebox.showerror("Render Error", message)
                    self.status_label.config(text="Render failed - Click 'Copy Last Error' to see details")
                    self.progress_label.config(text="Failed", foreground="red")
                    self.progress_var.set(0)

                    # Store error for copying and show copy button
                    self.last_error_message = f"Render Error: {message}"
                    self.global_copy_btn.pack(side=tk.RIGHT, padx=(5, 0))

            self.root.after(0, update_ui)

        threading.Thread(target=render_thread, daemon=True).start()


def main():
    """Main entry point."""
    root = tk.Tk()

    # Set up style
    style = ttk.Style()
    style.theme_use('clam')

    app = AudioMixerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
