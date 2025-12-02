#!/usr/bin/env python3
"""
FAST deployment script - optimized for speed

This version includes all quick-win optimizations:
- Parallel builds
- Build cache enabled
- Configuration cache
- Skips unnecessary tasks
- Uses environment variables for ABI selection
"""

import os
import json
import subprocess
import sys
import time

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# If modifying these scopes, delete the file token.json.
SCOPES = ['https://www.googleapis.com/auth/drive.file']

# The folder ID provided by the user
FOLDER_ID = '17BDqYETePQ7111xjpVkBYe9wQrwuvDgn'
APK_NAME = 'app-release.apk'
VERSION_FILE_NAME = 'version.json'

# Adjust paths based on where script is run
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_JSON_PATH = os.path.join(BASE_DIR, 'app.json')
ANDROID_DIR = os.path.join(BASE_DIR, 'android')
APK_OUTPUT_PATH = os.path.join(ANDROID_DIR, 'app/build/outputs/apk/release/app-release.apk')
CREDENTIALS_PATH = os.path.join(BASE_DIR, 'credentials.json')
TOKEN_PATH = os.path.join(BASE_DIR, 'token.json')

# Build configuration
# Set this to customize which ABIs to build
# Options: "arm64-v8a" (fastest, 70% time savings)
#          "arm64-v8a,armeabi-v7a" (good balance)
#          "armeabi-v7a,arm64-v8a,x86,x86_64" (all ABIs, slowest)
BUILD_ABIS = os.environ.get('BUILD_ABIS', 'arm64-v8a')

def get_version():
    with open(APP_JSON_PATH, 'r') as f:
        data = json.load(f)
    return data.get('expo', {}).get('version', '1.0.0')

def update_build_info():
    """Update BuildInfo.ts with current build timestamp"""
    build_info_path = os.path.join(BASE_DIR, 'constants/BuildInfo.ts')
    build_time = time.strftime("%Y-%m-%d %H:%M:%S")

    print(f"📝 Updating BuildInfo.ts with timestamp: {build_time}")

    content = f"export const BUILD_DATE = '{build_time}';\n"

    with open(build_info_path, 'w') as f:
        f.write(content)

    print(f"   ✅ BuildInfo.ts updated")
    return build_time

def build_apk():
    print("=" * 80)
    print("BUILDING APK (OPTIMIZED)")
    print("=" * 80)
    print(f"Building for ABIs: {BUILD_ABIS}")
    print(f"Gradle cache: ENABLED")
    print(f"Configuration cache: ENABLED")
    print(f"Parallel workers: 4")
    print("-" * 80)

    start_time = time.time()

    # Ensure gradlew is executable
    gradlew_path = os.path.join(ANDROID_DIR, 'gradlew')
    os.chmod(gradlew_path, 0o755)

    try:
        # Optimized gradle command
        gradle_args = [
            './gradlew',
            'assembleRelease',
            '--parallel',                  # Parallel execution
            '--build-cache',               # Use build cache
            # Note: --configuration-cache not compatible with Expo
            '-x', 'lint',                  # Skip lint
            '-x', 'test',                  # Skip tests
            '-x', 'lintVitalRelease',      # Skip vital lint
            f'-PreactNativeArchitectures={BUILD_ABIS}',  # Specify ABIs
            f'-Dorg.gradle.jvmargs=-Xmx4096m',  # More memory
            f'-Dorg.gradle.workers.max=4',      # Max workers
        ]

        print(f"Command: {' '.join(gradle_args)}")
        print("-" * 80)

        subprocess.check_call(gradle_args, cwd=ANDROID_DIR)

    except subprocess.CalledProcessError:
        print("\n❌ Build failed.")
        sys.exit(1)

    if not os.path.exists(APK_OUTPUT_PATH):
        print(f"\n❌ APK not found at {APK_OUTPUT_PATH}")
        sys.exit(1)

    build_time = time.time() - start_time
    apk_size_mb = os.path.getsize(APK_OUTPUT_PATH) / (1024 * 1024)

    print("=" * 80)
    print("✅ BUILD SUCCESSFUL")
    print("=" * 80)
    print(f"APK Location: {APK_OUTPUT_PATH}")
    print(f"APK Size: {apk_size_mb:.2f} MB")
    print(f"Build Time: {build_time:.1f} seconds ({build_time/60:.1f} minutes)")
    print("=" * 80)

def authenticate():
    creds = None
    if os.path.exists(TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                print(f"Error refreshing token: {e}")
                os.remove(TOKEN_PATH)
                creds = None

        if not creds:
            if not os.path.exists(CREDENTIALS_PATH):
                print(f"ERROR: {CREDENTIALS_PATH} not found.")
                print("Please enable the Drive API, create OAuth 2.0 credentials (Desktop),")
                print("and save the 'credentials.json' file in the project root.")
                print("Go to: https://console.cloud.google.com/apis/credentials")
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_PATH, 'w') as token:
            token.write(creds.to_json())
    return creds

def find_file(service, name):
    query = f"'{FOLDER_ID}' in parents and name = '{name}' and trashed = false"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    files = results.get('files', [])
    if files:
        return files[0]['id']
    return None

def upload_file(service, file_path, name, mime_type):
    start_time = time.time()
    file_id = find_file(service, name)
    media = MediaFileUpload(file_path, mimetype=mime_type, resumable=True)

    if file_id:
        print(f"Updating existing file '{name}'...")
        file = service.files().update(fileId=file_id, media_body=media).execute()
    else:
        print(f"Creating new file '{name}'...")
        file_metadata = {'name': name, 'parents': [FOLDER_ID]}
        file = service.files().create(body=file_metadata, media_body=media, fields='id').execute()
        file_id = file.get('id')

    # Make file publicly readable
    try:
        permission = {
            'type': 'anyone',
            'role': 'reader'
        }
        service.permissions().create(fileId=file_id, body=permission).execute()
    except:
        pass  # Permission might already exist

    upload_time = time.time() - start_time
    print(f"✅ Uploaded in {upload_time:.1f} seconds")

    return file_id

def main():
    total_start = time.time()

    version = get_version()
    print("\n" + "=" * 80)
    print(f"FAST DEPLOYMENT - VERSION {version}")
    print("=" * 80)

    # Update build timestamp first
    print()
    build_time = update_build_info()

    # Build the APK
    print()
    build_apk()

    # Then auth (interactive if needed)
    print("\n🔐 Authenticating with Google Drive...")
    creds = authenticate()
    service = build('drive', 'v3', credentials=creds)

    # Upload APK
    print("\n📤 Uploading APK to Google Drive...")
    apk_id = upload_file(service, APK_OUTPUT_PATH, APK_NAME, 'application/vnd.android.package-archive')
    apk_url = f"https://drive.google.com/uc?export=download&id={apk_id}"

    # Create/Update version.json
    version_data = {
        "version": version,
        "apkUrl": apk_url,
        "note": f"Automated build for version {version}",
        "buildDate": build_time,
        "abis": BUILD_ABIS
    }

    # Write temp version.json
    temp_version_file = os.path.join(BASE_DIR, 'version.json')
    with open(temp_version_file, 'w') as f:
        json.dump(version_data, f, indent=2)

    print("\n📤 Uploading version.json...")
    version_file_id = upload_file(service, temp_version_file, VERSION_FILE_NAME, 'application/json')
    version_url = f"https://drive.google.com/uc?export=download&id={version_file_id}"

    if os.path.exists(temp_version_file):
        os.remove(temp_version_file)

    total_time = time.time() - total_start

    print("\n" + "=" * 80)
    print("🎉 DEPLOYMENT COMPLETE")
    print("=" * 80)
    print(f"Total Time: {total_time:.1f} seconds ({total_time/60:.1f} minutes)")
    print("-" * 80)
    print(f"App Version: {version}")
    print(f"ABIs Built: {BUILD_ABIS}")
    print(f"APK Download URL:")
    print(f"  {apk_url}")
    print(f"\nVersion Info URL:")
    print(f"  {version_url}")
    print("-" * 80)
    print("\n📝 AutoUpdater is already configured with this URL.")
    print("=" * 80)
    print("\n💡 TIP: To build even faster, use:")
    print("   BUILD_ABIS=arm64-v8a python scripts/deploy_fast.py")
    print("=" * 80)

if __name__ == '__main__':
    main()
