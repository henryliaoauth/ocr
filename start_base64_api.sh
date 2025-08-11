#!/bin/bash

# Start Base64 API Integration Service
# This script starts the Gradio interface that converts images to base64 and sends to external API

echo "🔄 Starting DotsOCR Base64 API Integration Service"
echo "=================================================="

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 is not installed or not in PATH"
    exit 1
fi

# Check if required Python packages are available
echo "🔍 Checking dependencies..."
python3 -c "import gradio, requests, PIL" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "❌ Missing dependencies. Please install:"
    echo "   pip install gradio requests pillow"
    exit 1
fi

# Set default port
PORT=${1:-7862}

echo "✅ Dependencies OK"
echo "🌐 External API: https://qa.agent.authme.ai"
echo "🔗 Starting Gradio interface on port $PORT"
echo "📱 Access at: http://localhost:$PORT"
echo "=================================================="

# Start the service
cd "$(dirname "$0")"
python3 demo/demo_gradio_base64_api.py $PORT