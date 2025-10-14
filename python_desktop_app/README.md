# Audiobook & Background Music Mixer

A Python desktop application for mixing audiobooks with background music. Features include speed adjustment, volume control, audio preview, and high-quality MP3 export.

## Features

- **Load Audio Files**: Support for MP3 audiobooks and background music
- **Speed Control**: Adjust audiobook playback speed from 0.5x to 2.0x
- **Volume Control**: Independent volume adjustment for audiobook and background music
- **Auto-Loop**: Background music automatically loops to match audiobook length
- **Preview**: Listen to 10s or 30s previews before rendering
- **Export**: Render mixed audio to high-quality MP3 file (192kbps)
- **User-Friendly GUI**: Clean, intuitive interface built with tkinter

## Requirements

- Python 3.7 or higher
- FFmpeg (for audio processing)

## Installation

### 1. Install FFmpeg

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH

### 2. Run Setup Script

```bash
cd python_desktop_app
chmod +x setup.sh run.sh
./setup.sh
```

This will:
- Create a Python virtual environment
- Install all required dependencies (pydub, pygame)
- Verify system requirements

## Usage

### Running the Application

**Easy way (recommended):**
```bash
./run.sh
```

**Manual way:**
```bash
source venv/bin/activate
python main.py
```

### Using the App

1. **Load Audiobook**: Click "Browse Audiobook" and select your audiobook MP3 file
2. **Load Background Music**: Click "Browse Music" and select your background music MP3 file
3. **Adjust Settings**:
   - **Audiobook Speed**: Use the slider to change playback speed (0.5x - 2.0x)
   - **Audiobook Volume**: Adjust audiobook volume (-20dB to +20dB)
   - **Music Volume**: Adjust background music volume (-30dB to +10dB)
4. **Preview**: Click "Preview 10s" or "Preview 30s" to hear a sample
5. **Render**: Click "Render to MP3 File" to export the final mixed audio

## Features Explained

### Speed Adjustment
The audiobook speed can be adjusted from 0.5x (half speed) to 2.0x (double speed) without changing the pitch. This is useful for:
- Speeding up slow narrators
- Slowing down fast-paced content

### Volume Control
- **Audiobook Volume**: Typically kept at 0dB (default)
- **Music Volume**: Default is -10dB to ensure the audiobook remains clearly audible
- Both can be adjusted to your preference

### Background Music Looping
The background music automatically loops seamlessly to match the length of the audiobook. You don't need to worry about the music being shorter than the audiobook.

### Preview Mode
Before rendering the entire file (which can take time for large audiobooks), you can preview the first 10 or 30 seconds to ensure the mix sounds good.

## File Structure

```
python_desktop_app/
├── main.py              # Main GUI application
├── audio_processor.py   # Audio processing logic
├── requirements.txt     # Python dependencies
├── setup.sh            # Setup script (creates venv)
├── run.sh              # Launch script
├── README.md           # This file
├── QUICKSTART.md       # Quick start guide
└── venv/               # Virtual environment (created by setup.sh)
```

## Troubleshooting

### "FFmpeg not found" error
Make sure FFmpeg is installed and accessible from your PATH. Test by running:
```bash
ffmpeg -version
```

### Audio playback issues
If preview playback doesn't work, ensure pygame is properly installed:
```bash
source venv/bin/activate
pip install --upgrade pygame
```

### "externally-managed-environment" error
This is normal on newer Linux systems. Use the provided setup script which creates a virtual environment:
```bash
./setup.sh
```

### Large file processing
For very large audiobook files (>1GB), the rendering process may take several minutes. Be patient and watch the progress bar.

## Technical Details

- **Audio Processing**: Uses pydub library with FFmpeg backend
- **Playback**: pygame mixer for audio preview
- **GUI**: tkinter (included with Python)
- **Export Format**: MP3 at 192kbps bitrate
- **Threading**: Background threads for preview and rendering to keep UI responsive

## Known Limitations

- Only MP3 input files are currently supported
- Preview playback cannot be stopped once started (plays for full duration)
- Very large audiobook files (>2GB) may require significant RAM

## Future Enhancements

Potential features for future versions:
- Support for more audio formats (WAV, AAC, FLAC)
- Pause/resume preview playback
- Multiple background music tracks
- Fade in/out effects
- Equalizer controls
- Batch processing

## License

This project is provided as-is for personal use.

## Credits

Built with:
- [pydub](https://github.com/jiaaro/pydub) - Audio manipulation
- [pygame](https://www.pygame.org/) - Audio playback
- [tkinter](https://docs.python.org/3/library/tkinter.html) - GUI framework
- [FFmpeg](https://ffmpeg.org/) - Audio codec backend
