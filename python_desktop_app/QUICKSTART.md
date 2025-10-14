# Quick Start Guide

Get up and running with the Audiobook & Music Mixer in 2 simple steps:

## Step 1: Install FFmpeg

**Ubuntu/Debian:**
```bash
sudo apt-get update && sudo apt-get install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html)

## Step 2: Run Setup

```bash
cd python_desktop_app
chmod +x setup.sh run.sh
./setup.sh
```

This will:
- Create a virtual environment
- Install all Python dependencies
- Prepare the app for first run

## Step 3: Launch the App

```bash
./run.sh
```

That's it! The app will open and you're ready to start mixing.

## First Mix - In 60 Seconds

1. Launch the app
2. Click **"Browse Audiobook"** → select your audiobook MP3
3. Click **"Browse Music"** → select your background music MP3
4. Click **"Preview 10s"** to hear a sample
5. Adjust sliders if needed (speed, volumes)
6. Click **"Render to MP3 File"** → choose save location
7. Wait for render to complete
8. Enjoy your mixed audiobook!

## Tips

- **Music too loud?** Decrease the Music Volume slider (try -15dB)
- **Audiobook too fast?** Adjust the Speed slider to 0.75x or 0.5x
- **Want to speed up?** Set speed to 1.25x or 1.5x
- **Always preview first** - saves time if settings need adjustment

## Troubleshooting

**Can't hear preview?**
- Check your system volume
- Make sure your speakers/headphones are connected

**Render taking forever?**
- Normal for large audiobooks (1+ hour)
- Check the progress bar

**FFmpeg error?**
- Verify installation: `ffmpeg -version`
- Make sure it's in your PATH

Need help? Check the full README.md for detailed documentation.
