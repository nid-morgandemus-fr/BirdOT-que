#!/bin/bash

echo "🐦 Starting BirdOTèque..."

# Install dependencies quietly
echo "📦 Checking and installing dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq python3 python3-pip python3-tk python3-venv ffmpeg > /dev/null 2>&1

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "🛠️  Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install Python packages quietly
echo "⬇️  Installing Python packages..."
pip install -q flask markdown

# Check for required files
if [ ! -f "app.py" ] || [ ! -f "templates/index.html" ]; then
    echo "❌ Error: app.py or templates/index.html not found!"
    exit 1
fi

echo "✅ Ready! Launching BirdOTèque..."
echo "🌐 Open your browser at http://localhost:5000"
echo "----------------------------------------"

# Run the application
python3 app.py

# Deactivate on exit
deactivate
