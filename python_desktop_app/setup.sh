#!/bin/bash

# Setup script for Audiobook & Music Mixer
# Creates a virtual environment and installs dependencies

set -e

echo "==================================="
echo "Audiobook & Music Mixer - Setup"
echo "==================================="
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

echo "✓ Python 3 found: $(python3 --version)"

# Check if FFmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠ Warning: FFmpeg is not installed"
    echo ""
    echo "Please install FFmpeg:"
    echo "  Ubuntu/Debian: sudo apt-get install ffmpeg"
    echo "  macOS: brew install ffmpeg"
    echo ""
    read -p "Press Enter to continue anyway, or Ctrl+C to exit..."
else
    echo "✓ FFmpeg found: $(ffmpeg -version | head -n1)"
fi

# Check if venv module is available
if ! python3 -m venv --help &> /dev/null; then
    echo ""
    echo "Error: python3-venv is not installed"
    echo "Install it with: sudo apt-get install python3-venv"
    exit 1
fi

echo ""
echo "Creating virtual environment..."

# Remove old venv if it exists
if [ -d "venv" ]; then
    echo "Removing old virtual environment..."
    rm -rf venv
fi

# Create virtual environment
python3 -m venv venv

echo "✓ Virtual environment created"
echo ""
echo "Installing dependencies..."

# Activate venv and install requirements
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "==================================="
echo "✓ Setup complete!"
echo "==================================="
echo ""
echo "To run the application:"
echo "  ./run.sh"
echo ""
echo "Or manually:"
echo "  source venv/bin/activate"
echo "  python main.py"
echo ""
