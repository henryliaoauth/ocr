# Base64 API Integration for DotsOCR

This integration converts images to base64 format and sends them to the external API using the exact structure you specified.

## 🔄 API Structure

The integration uses the exact curl command structure you provided:

```json
{
    "inputs": {
        "base64": "[base64 encoded image data]"
    },
    "response_mode": "blocking",
    "user": "abc-123"
}
```

## 📁 Files Created

### 1. `demo/demo_gradio_base64_api.py`
- Main Gradio interface for base64 API integration
- Automatically converts images/PDFs to base64
- Uses blocking response mode
- Matches your exact API structure

### 2. `test_base64_api.py`
- Test script to verify base64 conversion and API calls
- Generates equivalent curl commands
- Useful for debugging and testing

### 3. `start_base64_api.sh`
- Startup script for the base64 API service
- Checks dependencies and starts the Gradio interface

### 4. `BASE64_API_README.md`
- This documentation file

## 🚀 Usage

### Start the Service

```bash
# Make script executable (if not already)
chmod +x start_base64_api.sh

# Start the service (default port 7862)
./start_base64_api.sh

# Or specify a custom port
./start_base64_api.sh 8080
```

### Access the Interface

Open your browser to: `http://localhost:7862`

### Test with Command Line

```bash
# Test with an image file
python3 test_base64_api.py path/to/your/image.jpg

# Test with custom user ID
python3 test_base64_api.py path/to/your/image.jpg my-user-123
```

## ⚙️ Configuration

### API Settings
- **Endpoint**: `https://qa.agent.authme.ai/v1/scenarios/run`
- **Token**: `app-a3mA4KYAWKYexq6GSbTde9Tb`
- **Response Mode**: `blocking`

### Supported Formats
- **Images**: JPG, JPEG, PNG
- **Documents**: PDF (converts first page to image)

## 🔧 Key Features

### ✅ Automatic Base64 Conversion
- Images are automatically converted to base64 format
- JPEG compression at 95% quality for optimal file size
- Handles RGBA, LA, P color modes by converting to RGB

### ✅ Exact API Structure Match
- Uses the exact JSON structure from your curl command
- Blocking response mode as specified
- Proper Bearer token authentication

### ✅ Error Handling
- Connection timeout handling
- JSON parsing error handling
- File conversion error handling
- Clear error messages in the UI

### ✅ Testing & Debugging
- Generate equivalent curl commands
- View base64 data length and structure
- Display full API responses
- Copy-paste functionality for responses

## 📋 API Request Example

```bash
curl -X POST 'https://qa.agent.authme.ai/v1/scenarios/run' \
--header 'Authorization: Bearer app-a3mA4KYAWKYexq6GSbTde9Tb' \
--header 'Content-Type: application/json' \
--data-raw '{
    "inputs": {
        "base64": "[your base64 image data here]"
    },
    "response_mode": "blocking",
    "user": "abc-123"
}'
```

## 🐛 Troubleshooting

### Common Issues

1. **Connection Error**
   - Check internet connection
   - Verify API endpoint is accessible
   - Check if firewall is blocking requests

2. **Authentication Error**
   - Verify the Bearer token is correct
   - Check token hasn't expired
   - Ensure token has proper permissions

3. **Base64 Conversion Error**
   - Check image file is not corrupted
   - Verify file format is supported
   - Try with a smaller image file

4. **Timeout Error**
   - Large images may take longer to process
   - Try reducing image size or quality
   - Check API server response time

### Debug Steps

1. **Test Base64 Conversion**
   ```bash
   python3 test_base64_api.py your_image.jpg
   ```

2. **Check Generated Curl Command**
   - Run the test script to generate `generated_curl_command.sh`
   - Test the curl command directly in terminal

3. **View Detailed Logs**
   - Check console output in the Gradio interface
   - Look for error messages in the terminal

## 📊 Performance Notes

### Base64 Data Size
- Original image size affects base64 string length
- 1MB image ≈ ~1.3MB base64 string
- API may have size limits for requests

### Recommended Image Sizes
- **Optimal**: 1-3MB original file size
- **Maximum**: 5MB original file size
- **Resolution**: 1920x1080 or lower recommended

### Network Considerations
- Base64 encoding increases data size by ~33%
- Ensure stable internet connection for large files
- Consider compression for very large images

## 🔐 Security

- Bearer token is stored in the code (consider environment variables for production)
- Base64 data is transmitted over HTTPS
- No local file storage of sensitive data
- Clear session data on interface reset

## 🎯 Next Steps

1. **Test the integration** with your images
2. **Verify API responses** match your expectations
3. **Customize user ID** and other parameters as needed
4. **Monitor API usage** and response times
5. **Consider error handling** for production use

---

**Need help?** Check the console output for detailed error messages and debug information.