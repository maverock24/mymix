"""
Audio processing module for mixing audiobooks with background music.
Handles audio file loading, speed adjustment, volume control, looping, and rendering.
"""

from pydub import AudioSegment
import threading
import pygame
import os
import subprocess
import json
import tempfile


class AudioProcessor:
    """Handles all audio processing operations."""

    def __init__(self):
        self.audiobook = None
        self.background_music = None
        self.audiobook_path = None
        self.audiobook_files = []  # List of paths when loading from folder
        self.music_path = None

        # Settings
        self.audiobook_speed = 1.0
        self.audiobook_volume = 0  # dB adjustment
        self.music_volume = -10  # dB adjustment (quieter by default)

        # Playback control
        self.is_playing = False
        self.playback_thread = None
        self.current_playback_file = None
        self.streaming_process = None
        self.playback_start_time = 0
        self.playback_start_position = 0
        self.current_pygame_volume = 1.0  # Track current mixer volume (0.0 to 1.0)

        # Initialize pygame mixer for playback
        # Use standard format that matches our streaming output
        pygame.mixer.init(frequency=22050, size=-16, channels=1, buffer=4096)

    def get_audio_duration(self, file_path):
        """Get audio duration using ffprobe without loading the entire file."""
        try:
            result = subprocess.run(
                ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', file_path],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                return float(data['format']['duration'])
            return None
        except Exception:
            return None

    def _build_atempo_filter(self, speed):
        """Build atempo filter chain for ffmpeg. atempo only accepts 0.5-2.0, so chain for other values."""
        if speed == 1.0:
            return ""

        # atempo filter only accepts values between 0.5 and 2.0
        # For values outside this range, chain multiple atempo filters
        filters = []
        remaining_speed = speed

        while remaining_speed > 2.0:
            filters.append("atempo=2.0")
            remaining_speed /= 2.0

        while remaining_speed < 0.5:
            filters.append("atempo=0.5")
            remaining_speed /= 0.5

        if remaining_speed != 1.0:
            filters.append(f"atempo={remaining_speed:.3f}")

        return ",".join(filters) if filters else ""

    def load_audiobook(self, file_path, progress_callback=None):
        """
        Load an audiobook MP3 file.
        For playback, files are NOT loaded into memory - they are streamed directly.
        This method only loads files for rendering/preview purposes.

        Args:
            file_path: Path to the MP3 file
            progress_callback: Optional callback function(percent, message)
        """
        try:
            self.audiobook_path = file_path

            # Get file size for progress indication
            file_size = os.path.getsize(file_path) / (1024 * 1024)  # Size in MB

            if progress_callback:
                progress_callback(0, f"Analyzing audiobook ({file_size:.1f} MB)...")

            # Get duration first without loading
            duration_seconds = self.get_audio_duration(file_path)
            if duration_seconds:
                if progress_callback:
                    progress_callback(50, f"Duration: {duration_seconds/60:.1f} minutes")

            # For large files, skip loading into memory - we'll stream for playback
            if file_size > 300:
                if progress_callback:
                    progress_callback(100, f"Ready for streaming playback (file will not be loaded into memory)")

                # Don't load into memory, just store the path for streaming
                self.audiobook = None  # Will use streaming for playback
                return True, f"Ready: {os.path.basename(file_path)} ({duration_seconds/60:.1f} min, {file_size:.1f} MB) - Streaming mode"

            else:
                # Normal loading for smaller files (for preview/render)
                if progress_callback:
                    progress_callback(60, "Loading audio data...")
                self.audiobook = AudioSegment.from_mp3(file_path)

                if progress_callback:
                    progress_callback(100, "Audiobook loaded!")

                duration = len(self.audiobook) / 1000
                return True, f"Loaded: {os.path.basename(file_path)} ({duration:.1f}s, {file_size:.1f} MB)"

        except MemoryError as e:
            # Even if loading fails, we can still stream it
            self.audiobook = None
            if progress_callback:
                progress_callback(100, "File too large for preview, but streaming playback available")
            return True, f"Ready for streaming: {os.path.basename(file_path)} (too large to load, streaming only)"
        except Exception as e:
            error_msg = str(e)
            # Provide more helpful error messages
            if "format" in error_msg.lower() or "codec" in error_msg.lower():
                return False, f"Audio format issue. Make sure the file is a valid MP3. Error: {error_msg}"
            else:
                return False, f"Error analyzing audiobook: {error_msg}"

    def load_audiobook_folder(self, file_paths, progress_callback=None):
        """
        Load multiple audiobook files from a folder and prepare for merging.
        Files will be concatenated in sorted order.

        Args:
            file_paths: List of MP3 file paths (should be pre-sorted)
            progress_callback: Optional callback function(percent, message)
        """
        try:
            if not file_paths:
                return False, "No files provided"

            # Store file paths for rendering
            self.audiobook_files = file_paths
            self.audiobook_path = None  # Clear single file path

            # Calculate total size and duration
            total_size = 0
            total_duration = 0

            if progress_callback:
                progress_callback(0, f"Analyzing {len(file_paths)} files...")

            for i, file_path in enumerate(file_paths):
                file_size = os.path.getsize(file_path) / (1024 * 1024)  # MB
                total_size += file_size

                # Get duration
                duration = self.get_audio_duration(file_path)
                if duration:
                    total_duration += duration

                if progress_callback and i % 5 == 0:  # Update every 5 files
                    progress = int((i / len(file_paths)) * 80)
                    progress_callback(progress, f"Analyzed {i+1}/{len(file_paths)} files...")

            if progress_callback:
                progress_callback(90, f"Total: {len(file_paths)} files, {total_size:.1f} MB, {total_duration/60:.1f} min")

            # Don't load into memory - will use streaming for playback and rendering
            self.audiobook = None

            if progress_callback:
                progress_callback(100, "Ready for streaming")

            return True, f"Ready: {len(file_paths)} files ({total_duration/60:.1f} min, {total_size:.1f} MB) - Streaming mode"

        except Exception as e:
            error_msg = str(e)
            return False, f"Error analyzing audiobook folder: {error_msg}"

    def load_background_music(self, file_path, progress_callback=None):
        """
        Load a background music MP3 file.
        For playback, files are NOT loaded into memory - they are streamed directly.
        This method only loads files for rendering/preview purposes.

        Args:
            file_path: Path to the MP3 file
            progress_callback: Optional callback function(percent, message)
        """
        try:
            self.music_path = file_path

            # Get file size for progress indication
            file_size = os.path.getsize(file_path) / (1024 * 1024)  # Size in MB

            if progress_callback:
                progress_callback(0, f"Analyzing music ({file_size:.1f} MB)...")

            # Get duration first without loading
            duration_seconds = self.get_audio_duration(file_path)
            if duration_seconds:
                if progress_callback:
                    progress_callback(50, f"Duration: {duration_seconds:.1f} seconds")

            # For large music files, skip loading into memory - we'll stream for playback
            if file_size > 100:
                if progress_callback:
                    progress_callback(100, f"Ready for streaming playback (file will not be loaded into memory)")

                # Don't load into memory, just store the path for streaming
                self.background_music = None  # Will use streaming for playback
                return True, f"Ready: {os.path.basename(file_path)} ({duration_seconds:.1f}s, {file_size:.1f} MB) - Streaming mode"

            else:
                # Normal loading for smaller files (for preview/render)
                if progress_callback:
                    progress_callback(60, "Loading audio data...")
                self.background_music = AudioSegment.from_mp3(file_path)

                if progress_callback:
                    progress_callback(100, "Music loaded!")

                duration = len(self.background_music) / 1000
                return True, f"Loaded: {os.path.basename(file_path)} ({duration:.1f}s, {file_size:.1f} MB)"

        except MemoryError as e:
            # Even if loading fails, we can still stream it
            self.background_music = None
            if progress_callback:
                progress_callback(100, "File too large for preview, but streaming playback available")
            return True, f"Ready for streaming: {os.path.basename(file_path)} (too large to load, streaming only)"
        except Exception as e:
            error_msg = str(e)
            # Provide more helpful error messages
            if "format" in error_msg.lower() or "codec" in error_msg.lower():
                return False, f"Audio format issue. Make sure the file is a valid MP3. Error: {error_msg}"
            else:
                return False, f"Error analyzing music: {error_msg}"

    def set_audiobook_speed(self, speed):
        """Set audiobook playback speed (0.5 to 2.0)."""
        self.audiobook_speed = max(0.5, min(2.0, speed))

    def set_audiobook_volume(self, volume_db):
        """Set audiobook volume adjustment in dB."""
        self.audiobook_volume = volume_db
        # Apply volume change in real-time during playback if possible
        self._update_playback_volume()

    def set_music_volume(self, volume_db):
        """Set background music volume adjustment in dB."""
        self.music_volume = volume_db
        # Apply volume change in real-time during playback if possible
        self._update_playback_volume()

    def _update_playback_volume(self):
        """Update pygame mixer volume in real-time without restarting playback."""
        if self.is_playing and pygame.mixer.music.get_busy():
            # Calculate combined volume adjustment
            # Since we can't change individual tracks during playback,
            # we'll apply a compromise volume that approximates the mix
            # This is much better than restarting playback!

            # Convert dB to linear scale (0 dB = 1.0, -6 dB ≈ 0.5, +6 dB ≈ 2.0)
            # Formula: linear = 10^(dB/20)
            audiobook_linear = 10 ** (self.audiobook_volume / 20.0)
            music_linear = 10 ** (self.music_volume / 20.0)

            # Average the two volumes (weighted toward audiobook which is primary)
            # This is an approximation since we're mixing them
            combined_linear = (audiobook_linear * 0.7 + music_linear * 0.3)

            # Clamp to valid pygame range (0.0 to 1.0)
            pygame_volume = max(0.0, min(1.0, combined_linear))

            # Update pygame volume
            pygame.mixer.music.set_volume(pygame_volume)
            self.current_pygame_volume = pygame_volume

    def adjust_speed(self, audio, speed):
        """Adjust audio speed without changing pitch."""
        if speed == 1.0:
            return audio

        # Change frame rate to adjust speed
        sound_with_altered_frame_rate = audio._spawn(audio.raw_data, overrides={
            "frame_rate": int(audio.frame_rate * speed)
        })
        # Convert back to standard frame rate
        return sound_with_altered_frame_rate.set_frame_rate(audio.frame_rate)

    def loop_music_to_length(self, music, target_length_ms):
        """Loop background music to match the target length."""
        if len(music) >= target_length_ms:
            return music[:target_length_ms]

        # Calculate how many times to loop
        loops_needed = (target_length_ms // len(music)) + 1
        looped_music = music * loops_needed

        # Trim to exact length
        return looped_music[:target_length_ms]

    def mix_audio(self):
        """
        Mix audiobook with background music and apply all settings.
        Returns the mixed audio segment.
        """
        if not self.audiobook or not self.background_music:
            return None, "Please load both audiobook and background music first."

        try:
            # Apply speed adjustment to audiobook
            adjusted_audiobook = self.adjust_speed(self.audiobook, self.audiobook_speed)

            # Apply volume adjustments
            adjusted_audiobook = adjusted_audiobook + self.audiobook_volume
            adjusted_music = self.background_music + self.music_volume

            # Loop background music to match audiobook length
            target_length = len(adjusted_audiobook)
            looped_music = self.loop_music_to_length(adjusted_music, target_length)

            # Mix both audio tracks
            mixed_audio = adjusted_audiobook.overlay(looped_music)

            return mixed_audio, "Audio mixed successfully"
        except Exception as e:
            return None, f"Error mixing audio: {str(e)}"

    def render_to_file(self, output_path, progress_callback=None):
        """
        Render the mixed audio to a file.
        Supports both loaded files (in-memory), streaming mode (large files), and multiple file merging.

        Args:
            output_path: Path where the output file should be saved
            progress_callback: Optional callback function for progress updates
        """
        # Check if we have files (either loaded or paths)
        has_audiobook = self.audiobook or self.audiobook_path or self.audiobook_files
        has_music = self.background_music or self.music_path

        if not has_audiobook or not has_music:
            return False, "Please load both audiobook and background music first."

        try:
            # If files are loaded in memory, use pydub
            if self.audiobook and self.background_music:
                if progress_callback:
                    progress_callback(10, "Mixing audio in memory...")

                # Mix audio
                mixed_audio, message = self.mix_audio()
                if not mixed_audio:
                    return False, message

                if progress_callback:
                    progress_callback(50, "Exporting audio...")

                # Export to file
                mixed_audio.export(output_path, format="mp3", bitrate="192k")

                if progress_callback:
                    progress_callback(100, "Export complete!")

                return True, f"Audio saved to: {output_path}"

            # Otherwise, use ffmpeg streaming for large files
            else:
                if progress_callback:
                    progress_callback(10, "Preparing ffmpeg render...")

                # Build atempo filter
                atempo_filter = self._build_atempo_filter(self.audiobook_speed)

                # Handle multiple audiobook files or single file
                if self.audiobook_files:
                    # Multiple files - need to concatenate them first
                    if progress_callback:
                        progress_callback(15, f"Preparing to merge {len(self.audiobook_files)} files...")

                    # Calculate total duration
                    total_duration = 0
                    for file_path in self.audiobook_files:
                        duration = self.get_audio_duration(file_path)
                        if duration:
                            total_duration += duration

                    if total_duration == 0:
                        return False, "Could not determine audiobook duration"

                    adjusted_duration = total_duration / self.audiobook_speed

                    # Build ffmpeg command for concatenating multiple files with music
                    # Use concat demuxer for efficient concatenation

                    # Create temporary concat file list
                    import tempfile
                    concat_file = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
                    for file_path in self.audiobook_files:
                        # Escape single quotes in file path
                        safe_path = file_path.replace("'", "'\\''")
                        concat_file.write(f"file '{safe_path}'\n")
                    concat_file.close()
                    concat_file_path = concat_file.name

                    # Build the audiobook filter chain
                    if atempo_filter:
                        audiobook_filter = f'[0:a]aresample=44100,{atempo_filter},volume={self.audiobook_volume}dB[a];'
                    else:
                        audiobook_filter = f'[0:a]aresample=44100,volume={self.audiobook_volume}dB[a];'

                    # Build ffmpeg command for rendering with optimizations
                    ffmpeg_cmd = [
                        'ffmpeg',
                        '-f', 'concat',                # Use concat demuxer
                        '-safe', '0',                  # Allow absolute paths
                        '-i', concat_file_path,        # Input concat file
                        '-stream_loop', '-1',          # Loop music indefinitely
                        '-i', self.music_path,         # Input music
                        '-filter_complex',
                        f'{audiobook_filter}'
                        f'[1:a]aresample=44100,volume={self.music_volume}dB[m];'
                        f'[a][m]amix=inputs=2:duration=first:dropout_transition=0[out]',
                        '-map', '[out]',               # Map the output of filter
                        '-t', str(adjusted_duration),  # Total duration
                        '-c:a', 'libmp3lame',          # MP3 codec
                        '-b:a', '192k',                # Audio bitrate
                        '-ar', '44100',                # Sample rate for MP3
                        '-q:a', '2',                   # Quality setting
                        '-threads', '0',               # Use all CPU cores
                        '-loglevel', 'warning',        # Only show warnings/errors
                        '-stats',                      # Show encoding stats
                        '-y',
                        output_path
                    ]
                else:
                    # Single file mode
                    # Get audiobook duration
                    duration = self.get_audio_duration(self.audiobook_path)
                    if not duration:
                        return False, "Could not determine audiobook duration"

                    # Calculate adjusted duration with speed
                    adjusted_duration = duration / self.audiobook_speed

                    # Build the audiobook filter chain with proper resampling
                    if atempo_filter:
                        audiobook_filter = f'[0:a]aresample=44100,{atempo_filter},volume={self.audiobook_volume}dB[a];'
                    else:
                        audiobook_filter = f'[0:a]aresample=44100,volume={self.audiobook_volume}dB[a];'

                    # Build ffmpeg command for rendering with optimizations
                    ffmpeg_cmd = [
                        'ffmpeg',
                        '-i', self.audiobook_path,    # Input audiobook
                        '-stream_loop', '-1',          # Loop music indefinitely
                        '-i', self.music_path,         # Input music
                        '-filter_complex',
                        f'{audiobook_filter}'
                        f'[1:a]aresample=44100,volume={self.music_volume}dB[m];'
                        f'[a][m]amix=inputs=2:duration=first:dropout_transition=0[out]',
                        '-map', '[out]',               # Map the output of filter
                        '-t', str(adjusted_duration),  # Total duration
                        '-c:a', 'libmp3lame',          # MP3 codec
                        '-b:a', '192k',                # Audio bitrate
                        '-ar', '44100',                # Sample rate for MP3
                        '-q:a', '2',                   # Quality setting (0-9, lower=better, faster than constant bitrate)
                        '-threads', '0',               # Use all CPU cores
                        '-loglevel', 'warning',        # Only show warnings/errors to reduce stderr noise
                        '-stats',                      # Show encoding stats
                        '-y',
                        output_path
                    ]

                if progress_callback:
                    progress_callback(20, "Starting render...")

                # Run ffmpeg with real-time progress tracking
                process = subprocess.Popen(
                    ffmpeg_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    universal_newlines=True,
                    bufsize=1
                )

                # Track progress by reading ffmpeg output
                import re
                import time
                import threading

                stderr_lines = []
                start_time = time.time()
                last_update_time = start_time

                # Helper function to format time
                def format_time(seconds):
                    if seconds < 60:
                        return f"{int(seconds)}s"
                    elif seconds < 3600:
                        mins = int(seconds / 60)
                        secs = int(seconds % 60)
                        return f"{mins}m {secs}s"
                    else:
                        hours = int(seconds / 3600)
                        mins = int((seconds % 3600) / 60)
                        return f"{hours}h {mins}m"

                # Read stderr in a loop and parse progress
                # ffmpeg with -stats outputs to stderr with format like: "time=00:01:23.45"
                while True:
                    line = process.stderr.readline()
                    if not line:
                        # Check if process finished
                        if process.poll() is not None:
                            break
                        continue

                    stderr_lines.append(line)

                    # Parse time from ffmpeg stats output (format: time=HH:MM:SS.MS)
                    time_match = re.search(r'time=(\d+):(\d+):(\d+\.\d+)', line)
                    if time_match and progress_callback:
                        hours = int(time_match.group(1))
                        minutes = int(time_match.group(2))
                        seconds = float(time_match.group(3))
                        current_seconds = hours * 3600 + minutes * 60 + seconds

                        # Throttle updates to every 0.3 seconds to avoid UI spam
                        current_time = time.time()
                        if current_time - last_update_time < 0.3:
                            continue
                        last_update_time = current_time

                        # Calculate progress percentage
                        if adjusted_duration > 0 and current_seconds > 0:
                            progress_ratio = min(current_seconds / adjusted_duration, 1.0)
                            progress_pct = min(95, 20 + int(progress_ratio * 75))

                            # Calculate time remaining
                            elapsed_time = current_time - start_time
                            if progress_ratio > 0.01:  # At least 1% progress
                                estimated_total_time = elapsed_time / progress_ratio
                                remaining_time = max(0, estimated_total_time - elapsed_time)

                                current_min = current_seconds / 60
                                total_min = adjusted_duration / 60
                                speed_ratio = current_seconds / elapsed_time if elapsed_time > 0 else 1.0

                                progress_callback(
                                    progress_pct,
                                    f"{progress_pct}% • {current_min:.1f}/{total_min:.1f} min • {speed_ratio:.2f}x speed • ETA: {format_time(remaining_time)}"
                                )
                            else:
                                # Early progress, no reliable ETA yet
                                current_min = current_seconds / 60
                                total_min = adjusted_duration / 60
                                progress_callback(
                                    progress_pct,
                                    f"{progress_pct}% • {current_min:.1f}/{total_min:.1f} min • Calculating ETA..."
                                )

                # Wait for process to complete
                process.wait()
                stderr_text = ''.join(stderr_lines)

                if process.returncode != 0:
                    # Extract the most relevant error lines
                    error_lines = [line for line in stderr_text.split('\n') if 'error' in line.lower() or 'invalid' in line.lower() or 'failed' in line.lower()]
                    if error_lines:
                        error_summary = '\n'.join(error_lines[-5:])  # Last 5 error lines
                    else:
                        error_summary = stderr_text[-500:]

                    # Log full error to console for debugging
                    import sys
                    print(f"FFmpeg render failed with return code {process.returncode}", file=sys.stderr)
                    print(f"Full stderr output:\n{stderr_text}", file=sys.stderr)

                    return False, f"FFmpeg render failed (code {process.returncode}):\n{error_summary}"

                # Verify output file exists and has reasonable size
                if not os.path.exists(output_path):
                    return False, "Output file was not created"

                file_size = os.path.getsize(output_path) / (1024 * 1024)  # Size in MB
                if file_size < 0.1:
                    return False, f"Output file is too small ({file_size:.2f} MB), render may have failed"

                # Clean up temporary concat file if it exists
                if self.audiobook_files and 'concat_file_path' in locals():
                    try:
                        os.unlink(concat_file_path)
                    except:
                        pass

                if progress_callback:
                    progress_callback(100, f"Export complete! ({file_size:.1f} MB)")

                return True, f"Audio saved to: {output_path} ({file_size:.1f} MB)"

        except KeyboardInterrupt:
            # User cancelled render
            if 'process' in locals() and process:
                try:
                    process.terminate()
                    process.wait(timeout=2)
                except:
                    process.kill()
            return False, "Render cancelled by user"
        except Exception as e:
            # Log full traceback for debugging
            import sys
            import traceback
            print(f"Render exception: {traceback.format_exc()}", file=sys.stderr)
            return False, f"Error rendering audio: {str(e)}"

    def get_audiobook_info(self):
        """Get information about the loaded audiobook."""
        if self.audiobook:
            # Loaded in memory
            duration = len(self.audiobook) / 1000
            adjusted_duration = duration / self.audiobook_speed
            return f"Duration: {duration:.1f}s → {adjusted_duration:.1f}s (at {self.audiobook_speed}x speed)"
        elif self.audiobook_files:
            # Multiple files mode
            total_duration = 0
            for file_path in self.audiobook_files:
                duration = self.get_audio_duration(file_path)
                if duration:
                    total_duration += duration
            if total_duration > 0:
                adjusted_duration = total_duration / self.audiobook_speed
                return f"Duration: {total_duration/60:.1f}min → {adjusted_duration/60:.1f}min (at {self.audiobook_speed}x speed) [{len(self.audiobook_files)} files]"
        elif self.audiobook_path:
            # Streaming mode (single file)
            duration = self.get_audio_duration(self.audiobook_path)
            if duration:
                adjusted_duration = duration / self.audiobook_speed
                return f"Duration: {duration/60:.1f}min → {adjusted_duration/60:.1f}min (at {self.audiobook_speed}x speed) [Streaming]"

        return "No audiobook loaded"

    def get_music_info(self):
        """Get information about the loaded background music."""
        if self.background_music:
            # Loaded in memory
            duration = len(self.background_music) / 1000
            return f"Duration: {duration:.1f}s (will loop)"
        elif self.music_path:
            # Streaming mode
            duration = self.get_audio_duration(self.music_path)
            if duration:
                return f"Duration: {duration:.1f}s (will loop) [Streaming]"

        return "No music loaded"

    def preview_mix(self, duration_seconds=10, start_position=0):
        """
        Preview N seconds of the mixed audio from a specific position.
        Uses streaming if files are not loaded into memory.
        Supports both single files and multiple files (folder mode).

        Args:
            duration_seconds: Number of seconds to preview
            start_position: Starting position in seconds (default: 0)
        """
        # Check if we have audiobook (either single file or multiple files)
        has_audiobook = self.audiobook_path or self.audiobook_files
        if not has_audiobook or not self.music_path:
            return False, "Please load both audiobook and background music first."

        try:
            # Stop any current playback first
            self.stop_playback()

            # If files are loaded in memory, use the old method (faster for small files)
            if self.audiobook and self.background_music:
                # Mix audio in memory
                mixed_audio, message = self.mix_audio()
                if not mixed_audio:
                    return False, message

                # Calculate start and end positions in milliseconds
                start_ms = int(start_position * 1000)
                end_ms = start_ms + (duration_seconds * 1000)

                # Make sure we don't exceed the audio length
                if start_ms >= len(mixed_audio):
                    return False, "Start position is beyond the audio length"

                end_ms = min(end_ms, len(mixed_audio))

                # Get preview segment
                preview = mixed_audio[start_ms:end_ms]

                # Export to temporary file and play using pygame
                temp_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
                temp_path = temp_file.name
                temp_file.close()

                preview.export(temp_path, format='wav')

                # Play using pygame mixer
                pygame.mixer.music.load(temp_path)

                # Set initial volume based on current settings
                self._update_playback_volume()

                pygame.mixer.music.play()
                self.is_playing = True
                self.current_playback_file = temp_path

                actual_duration = (end_ms - start_ms) / 1000
                return True, f"Playing {actual_duration:.1f}s from {start_position:.1f}s..."

            else:
                # Use streaming for large files (same as play_mix but with duration limit)
                temp_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
                temp_path = temp_file.name
                temp_file.close()

                # Build ffmpeg command for streaming preview
                atempo_filter = self._build_atempo_filter(self.audiobook_speed)

                # Build the audiobook filter chain
                if atempo_filter:
                    audiobook_filter = f'[0:a]{atempo_filter},volume={self.audiobook_volume}dB[a];'
                else:
                    audiobook_filter = f'[0:a]volume={self.audiobook_volume}dB[a];'

                # Handle multiple files or single file
                concat_file_path = None
                if self.audiobook_files:
                    # Multiple files - create concat file
                    concat_file = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
                    for file_path in self.audiobook_files:
                        safe_path = file_path.replace("'", "'\\''")
                        concat_file.write(f"file '{safe_path}'\n")
                    concat_file.close()
                    concat_file_path = concat_file.name

                    # Build audiobook filter with seeking using atrim filter instead of -ss
                    # atrim works better with concat demuxer
                    if atempo_filter:
                        if start_position > 0:
                            audiobook_filter = f'[0:a]atrim=start={start_position}:end={start_position + duration_seconds},{atempo_filter},volume={self.audiobook_volume}dB[a];'
                        else:
                            audiobook_filter = f'[0:a]{atempo_filter},volume={self.audiobook_volume}dB[a];'
                    else:
                        if start_position > 0:
                            audiobook_filter = f'[0:a]atrim=start={start_position}:end={start_position + duration_seconds},volume={self.audiobook_volume}dB[a];'
                        else:
                            audiobook_filter = f'[0:a]volume={self.audiobook_volume}dB[a];'

                    ffmpeg_cmd = [
                        'ffmpeg',
                        '-f', 'concat',                # Use concat demuxer
                        '-safe', '0',                  # Allow absolute paths
                        '-i', concat_file_path,        # Input concat file
                        '-stream_loop', '-1',          # Loop music indefinitely
                        '-i', self.music_path,         # Input music
                        '-filter_complex',
                        f'{audiobook_filter}'
                        f'[1:a]volume={self.music_volume}dB[m];'
                        f'[a][m]amix=inputs=2:duration=first:dropout_transition=0',
                        '-t', str(duration_seconds),  # Preview duration
                        '-ac', '1',      # Mono
                        '-ar', '22050',  # 22050 Hz sample rate
                        '-acodec', 'pcm_s16le',  # Ensure PCM 16-bit little-endian format
                        '-f', 'wav',     # Force WAV format
                        '-y',
                        temp_path
                    ]
                else:
                    # Single file mode
                    ffmpeg_cmd = [
                        'ffmpeg',
                        '-ss', str(start_position),  # Start position
                        '-i', self.audiobook_path,    # Input audiobook
                        '-stream_loop', '-1',          # Loop music indefinitely
                        '-i', self.music_path,         # Input music
                        '-filter_complex',
                        f'{audiobook_filter}'
                        f'[1:a]volume={self.music_volume}dB[m];'
                        f'[a][m]amix=inputs=2:duration=first:dropout_transition=0',
                        '-t', str(duration_seconds),  # Preview duration
                        '-ac', '1',      # Mono
                        '-ar', '22050',  # 22050 Hz sample rate
                        '-acodec', 'pcm_s16le',  # Ensure PCM 16-bit little-endian format
                        '-f', 'wav',     # Force WAV format
                        '-y',
                        temp_path
                    ]

                # Start ffmpeg in background
                self.streaming_process = subprocess.Popen(
                    ffmpeg_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )

                # Wait for initial data
                import time
                time.sleep(1.0)

                retry_count = 0
                min_file_size = 100000  # At least 100KB

                while retry_count < 15:
                    if os.path.exists(temp_path):
                        file_size = os.path.getsize(temp_path)
                        if file_size > min_file_size:
                            break
                        time.sleep(0.4)
                    else:
                        time.sleep(0.3)
                    retry_count += 1

                    # Check if ffmpeg failed
                    if self.streaming_process.poll() is not None:
                        stderr_output = self.streaming_process.stderr.read().decode('utf-8', errors='ignore')
                        return False, f"FFmpeg preview failed: {stderr_output[-300:]}"

                # Verify file is ready
                if not os.path.exists(temp_path) or os.path.getsize(temp_path) < min_file_size:
                    return False, f"Preview file not ready"

                # Start playing
                try:
                    pygame.mixer.music.load(temp_path)

                    # Set initial volume based on current settings
                    self._update_playback_volume()

                    pygame.mixer.music.play()
                    self.is_playing = True
                    self.current_playback_file = temp_path

                    # Clean up concat file after playback starts (ffmpeg has already read it)
                    if concat_file_path and os.path.exists(concat_file_path):
                        try:
                            os.unlink(concat_file_path)
                        except:
                            pass

                    return True, f"Streaming {duration_seconds}s preview from {start_position:.0f}s..."
                except pygame.error as e:
                    # If pygame can't load, provide helpful error
                    if self.streaming_process:
                        stderr_output = self.streaming_process.stderr.read().decode('utf-8', errors='ignore')
                        self.streaming_process.terminate()
                        self.streaming_process = None
                    # Clean up concat file on error
                    if concat_file_path and os.path.exists(concat_file_path):
                        try:
                            os.unlink(concat_file_path)
                        except:
                            pass
                    return False, f"Preview playback error: {str(e)}. Check ffmpeg: {stderr_output[-200:] if 'stderr_output' in locals() else 'no error log'}"

        except Exception as e:
            # Clean up concat file on error
            if 'concat_file_path' in locals() and concat_file_path and os.path.exists(concat_file_path):
                try:
                    os.unlink(concat_file_path)
                except:
                    pass
            return False, f"Error playing preview: {str(e)}"

    def play_mix(self, start_position=0):
        """
        Play the full mixed audio from a specific position using streaming.
        This starts playback immediately without loading entire files into memory.
        Supports both single files and multiple files (folder mode).

        Args:
            start_position: Starting position in seconds (default: 0)
        """
        # Check if we have audiobook (either single file or multiple files)
        has_audiobook = self.audiobook_path or self.audiobook_files
        if not has_audiobook or not self.music_path:
            return False, "Please load both audiobook and background music first."

        try:
            # Stop any current playback first
            self.stop_playback()

            # Get duration - handle both single file and multiple files
            if self.audiobook_files:
                # Multiple files mode - calculate total duration
                duration = 0
                for file_path in self.audiobook_files:
                    file_duration = self.get_audio_duration(file_path)
                    if file_duration:
                        duration += file_duration
                if duration == 0:
                    return False, "Could not determine audiobook duration"
            else:
                # Single file mode
                duration = self.get_audio_duration(self.audiobook_path)
                if not duration:
                    return False, "Could not determine audiobook duration"

            # Calculate adjusted duration with speed
            adjusted_duration = duration / self.audiobook_speed

            # Create a temporary file for streaming output
            temp_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            temp_path = temp_file.name
            temp_file.close()

            # Build ffmpeg command for streaming mix
            # This streams both files, adjusts speed/volume, and mixes on-the-fly

            # Handle atempo filter - it only accepts values between 0.5 and 2.0
            # For values outside this range, we need to chain multiple atempo filters
            atempo_filter = self._build_atempo_filter(self.audiobook_speed)

            # Build the audiobook filter chain
            if atempo_filter:
                audiobook_filter = f'[0:a]{atempo_filter},volume={self.audiobook_volume}dB[a];'
            else:
                audiobook_filter = f'[0:a]volume={self.audiobook_volume}dB[a];'

            # Handle multiple files or single file
            concat_file_path = None
            if self.audiobook_files:
                # Multiple files - create concat file
                concat_file = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
                for file_path in self.audiobook_files:
                    safe_path = file_path.replace("'", "'\\''")
                    concat_file.write(f"file '{safe_path}'\n")
                concat_file.close()
                concat_file_path = concat_file.name

                # Build audiobook filter with seeking using atrim filter instead of -ss
                # atrim works better with concat demuxer
                if atempo_filter:
                    if start_position > 0:
                        audiobook_filter = f'[0:a]atrim=start={start_position},{atempo_filter},volume={self.audiobook_volume}dB[a];'
                    else:
                        audiobook_filter = f'[0:a]{atempo_filter},volume={self.audiobook_volume}dB[a];'
                else:
                    if start_position > 0:
                        audiobook_filter = f'[0:a]atrim=start={start_position},volume={self.audiobook_volume}dB[a];'
                    else:
                        audiobook_filter = f'[0:a]volume={self.audiobook_volume}dB[a];'

                ffmpeg_cmd = [
                    'ffmpeg',
                    '-f', 'concat',                # Use concat demuxer
                    '-safe', '0',                  # Allow absolute paths
                    '-i', concat_file_path,        # Input concat file
                    '-stream_loop', '-1',          # Loop music indefinitely
                    '-i', self.music_path,         # Input music
                    '-filter_complex',
                    f'{audiobook_filter}'
                    f'[1:a]volume={self.music_volume}dB[m];'
                    f'[a][m]amix=inputs=2:duration=first:dropout_transition=0',
                    '-t', str(adjusted_duration - start_position),  # Duration to play
                    '-ac', '1',      # Mono
                    '-ar', '22050',  # 22050 Hz sample rate
                    '-acodec', 'pcm_s16le',  # Ensure PCM 16-bit little-endian format
                    '-f', 'wav',     # Force WAV format
                    '-y',
                    temp_path
                ]
            else:
                # Single file mode
                ffmpeg_cmd = [
                    'ffmpeg',
                    '-ss', str(start_position),  # Start position
                    '-i', self.audiobook_path,    # Input audiobook
                    '-stream_loop', '-1',          # Loop music indefinitely
                    '-i', self.music_path,         # Input music
                    '-filter_complex',
                    f'{audiobook_filter}'
                    f'[1:a]volume={self.music_volume}dB[m];'
                    f'[a][m]amix=inputs=2:duration=first:dropout_transition=0',
                    '-t', str(adjusted_duration - start_position),  # Duration to play
                    '-ac', '1',      # Mono
                    '-ar', '22050',  # 22050 Hz sample rate
                    '-acodec', 'pcm_s16le',  # Ensure PCM 16-bit little-endian format
                    '-f', 'wav',     # Force WAV format
                    '-y',
                    temp_path
                ]

            # Start ffmpeg in background to generate the stream
            self.streaming_process = subprocess.Popen(
                ffmpeg_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )

            # Wait for ffmpeg to generate enough audio data
            import time
            time.sleep(1.0)  # Initial wait

            # Check if enough data is available to start playback
            retry_count = 0
            min_file_size = 200000  # At least 200KB before trying to play

            while retry_count < 20:  # Wait up to 10 seconds
                # Check if file exists and has enough data
                if os.path.exists(temp_path):
                    file_size = os.path.getsize(temp_path)
                    if file_size > min_file_size:
                        break
                    elif file_size > 0:
                        # File is growing, keep waiting
                        time.sleep(0.5)
                    else:
                        # File exists but empty, wait a bit
                        time.sleep(0.3)
                else:
                    time.sleep(0.3)

                retry_count += 1

                # Check if ffmpeg has failed
                if self.streaming_process.poll() is not None:
                    # Process finished, check for errors
                    stderr_output = self.streaming_process.stderr.read().decode('utf-8', errors='ignore')
                    return False, f"FFmpeg failed: {stderr_output[-500:]}"  # Last 500 chars

            # Verify file is ready
            if not os.path.exists(temp_path):
                return False, "Failed to generate audio stream file"

            if os.path.getsize(temp_path) < min_file_size:
                return False, f"Audio file too small ({os.path.getsize(temp_path)} bytes), ffmpeg may have failed"

            # Start playing while ffmpeg continues streaming
            try:
                pygame.mixer.music.load(temp_path)

                # Set initial volume based on current settings
                self._update_playback_volume()

                pygame.mixer.music.play()
                self.is_playing = True
                self.current_playback_file = temp_path

                # Track playback position
                import time
                self.playback_start_time = time.time()
                self.playback_start_position = start_position

                # Clean up concat file after playback starts (ffmpeg has already read it)
                if concat_file_path and os.path.exists(concat_file_path):
                    try:
                        os.unlink(concat_file_path)
                    except:
                        pass

                return True, f"Streaming mixed audio (starting from {start_position:.0f}s)..."
            except pygame.error as e:
                # If pygame can't load, check ffmpeg stderr for details
                if self.streaming_process:
                    stderr_output = self.streaming_process.stderr.read().decode('utf-8', errors='ignore')
                    self.streaming_process.terminate()
                    self.streaming_process = None
                # Clean up concat file on error
                if concat_file_path and os.path.exists(concat_file_path):
                    try:
                        os.unlink(concat_file_path)
                    except:
                        pass
                return False, f"Playback error: {str(e)}. File size: {os.path.getsize(temp_path)} bytes. Check ffmpeg output."

        except Exception as e:
            # Clean up on error
            if self.streaming_process:
                try:
                    stderr_output = self.streaming_process.stderr.read().decode('utf-8', errors='ignore')
                    self.streaming_process.terminate()
                except:
                    pass
                self.streaming_process = None
            # Clean up concat file on error
            if 'concat_file_path' in locals() and concat_file_path and os.path.exists(concat_file_path):
                try:
                    os.unlink(concat_file_path)
                except:
                    pass
            return False, f"Error streaming audio: {str(e)}"

    def pause_playback(self):
        """Pause the current playback."""
        try:
            if self.is_playing and pygame.mixer.music.get_busy():
                pygame.mixer.music.pause()
                return True, "Playback paused"
            else:
                return False, "No audio is currently playing"
        except Exception as e:
            return False, f"Error pausing playback: {str(e)}"

    def resume_playback(self):
        """Resume paused playback."""
        try:
            pygame.mixer.music.unpause()
            return True, "Playback resumed"
        except Exception as e:
            return False, f"Error resuming playback: {str(e)}"

    def is_audio_playing(self):
        """Check if audio is currently playing."""
        try:
            return pygame.mixer.music.get_busy()
        except:
            return False

    def get_playback_position(self):
        """Get current playback position in seconds."""
        if not self.is_playing:
            return 0

        try:
            import time
            # Calculate elapsed time since playback started
            elapsed = time.time() - self.playback_start_time
            # Add to the starting position
            current_position = self.playback_start_position + elapsed
            return current_position
        except:
            return 0

    def seek_to_position(self, position_seconds):
        """Seek to a specific position in the audio."""
        # Check if we have audiobook (either single file or multiple files)
        has_audiobook = self.audiobook_path or self.audiobook_files
        if not has_audiobook or not self.music_path:
            return False, "No audio loaded"

        # Restart playback from new position
        was_playing = self.is_audio_playing()

        if was_playing or self.is_playing:
            # Stop current playback and start from new position
            success, message = self.play_mix(position_seconds)
            return success, f"Seeked to {position_seconds:.0f}s"
        else:
            # Not playing, just update the position for next play
            return True, f"Position set to {position_seconds:.0f}s"

    def get_mixed_duration(self):
        """Get the total duration of the mixed audio in seconds."""
        # Try to get duration from loaded audiobook first
        if self.audiobook:
            original_duration = len(self.audiobook) / 1000
            adjusted_duration = original_duration / self.audiobook_speed
            return adjusted_duration

        # If multiple files, sum their durations
        if self.audiobook_files:
            total_duration = 0
            for file_path in self.audiobook_files:
                duration = self.get_audio_duration(file_path)
                if duration:
                    total_duration += duration
            if total_duration > 0:
                adjusted_duration = total_duration / self.audiobook_speed
                return adjusted_duration

        # If not loaded (streaming mode), get duration from file
        if self.audiobook_path:
            duration = self.get_audio_duration(self.audiobook_path)
            if duration:
                adjusted_duration = duration / self.audiobook_speed
                return adjusted_duration

        return 0

    def stop_playback(self):
        """Stop any currently playing audio."""
        try:
            pygame.mixer.music.stop()
            self.is_playing = False

            # Stop streaming process if running
            if self.streaming_process:
                try:
                    self.streaming_process.terminate()
                    self.streaming_process.wait(timeout=2)
                except:
                    try:
                        self.streaming_process.kill()
                    except:
                        pass
                self.streaming_process = None

            # Clean up temporary playback file
            if self.current_playback_file and os.path.exists(self.current_playback_file):
                try:
                    # Small delay to ensure file is not in use
                    import time
                    time.sleep(0.1)
                    os.unlink(self.current_playback_file)
                except:
                    pass
                self.current_playback_file = None

            return True, "Playback stopped"
        except Exception as e:
            return False, f"Error stopping playback: {str(e)}"
