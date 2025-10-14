#!/bin/bash

# Audiobook & Music Mixer Launcher Script

echo "Starting Audiobook & Music Mixer..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo ""
    echo "Virtual environment not found!"
    echo "Please run setup first: ./setup.sh"
    echo ""
    exit 1
fi

# Check if FFmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "Warning: FFmpeg is not installed"
    echo "The app may not work without it."
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Activate virtual environment and run
source venv/bin/activate
python main.py
