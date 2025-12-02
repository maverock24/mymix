import os
import json
import subprocess
import sys

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

def get_version():
    with open(APP_JSON_PATH, 'r') as f:
        data = json.load(f)
    # Handling expo.version
    return data.get('expo', {}).get('version', '1.0.0')

def update_build_info():
    """Update BuildInfo.ts with current build timestamp"""
    import time
    build_info_path = os.path.join(BASE_DIR, 'constants/BuildInfo.ts')
    build_time = time.strftime("%Y-%m-%d %H:%M:%S")

    print(f"Updating BuildInfo.ts with timestamp: {build_time}")

    content = f"export const BUILD_DATE = '{build_time}';\n"

    with open(build_info_path, 'w') as f:
        f.write(content)

    print(f"BuildInfo.ts updated")
    return build_time

def build_apk():
    print("Building APK...")
    # Ensure gradlew is executable
    gradlew_path = os.path.join(ANDROID_DIR, 'gradlew')
    os.chmod(gradlew_path, 0o755)
    
    try:
        # Added optimization flags: --parallel, -x lint, -x test
        subprocess.check_call(['./gradlew', 'assembleRelease', '--parallel', '-x', 'lint', '-x', 'test'], cwd=ANDROID_DIR)
    except subprocess.CalledProcessError:
        print("Build failed.")
        sys.exit(1)
    if not os.path.exists(APK_OUTPUT_PATH):
        print(f"APK not found at {APK_OUTPUT_PATH}")
        sys.exit(1)
    print(f"APK built: {APK_OUTPUT_PATH}")

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
    # Search in the specific folder
    query = f"'{FOLDER_ID}' in parents and name = '{name}' and trashed = false"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    files = results.get('files', [])
    if files:
        return files[0]['id']
    return None

def upload_file(service, file_path, name, mime_type):
    file_id = find_file(service, name)
    media = MediaFileUpload(file_path, mimetype=mime_type, resumable=True)
    
    if file_id:
        print(f"Updating existing file '{name}' (ID: {file_id})...")
        file = service.files().update(fileId=file_id, media_body=media).execute()
    else:
        print(f"Creating new file '{name}'...")
        file_metadata = {'name': name, 'parents': [FOLDER_ID]}
        file = service.files().create(body=file_metadata, media_body=media, fields='id').execute()
        file_id = file.get('id')
    
    return file_id

def main():
    version = get_version()
    print(f"Deploying version {version}...")

    # Update build timestamp first
    build_time = update_build_info()

    # Build the APK
    build_apk()
    
    # Then auth (interactive if needed)
    creds = authenticate()
    service = build('drive', 'v3', credentials=creds)
    
    # Upload APK
    print("Uploading APK to Drive...")
    apk_id = upload_file(service, APK_OUTPUT_PATH, APK_NAME, 'application/vnd.android.package-archive')
    apk_url = f"https://drive.google.com/uc?export=download&id={apk_id}"
    print(f"APK Uploaded. ID: {apk_id}")
    
    # Create/Update version.json
    version_data = {
        "version": version,
        "apkUrl": apk_url,
        "note": f"Automated build for version {version}",
        "buildDate": build_time
    }
    
    # Write temp version.json
    temp_version_file = os.path.join(BASE_DIR, 'version.json')
    with open(temp_version_file, 'w') as f:
        json.dump(version_data, f, indent=2)
        
    print("Uploading version.json...")
    version_file_id = upload_file(service, temp_version_file, VERSION_FILE_NAME, 'application/json')
    version_url = f"https://drive.google.com/uc?export=download&id={version_file_id}"
    
    if os.path.exists(temp_version_file):
        os.remove(temp_version_file)
    
    print("\n" + "=" * 60)
    print("DEPLOYMENT COMPLETE")
    print("=" * 60)
    print(f"App Version: {version}")
    print(f"APK Download URL: {apk_url}")
    print(f"Version Info URL: {version_url}")
    print("-" * 60)
    print("ACTION REQUIRED:")
    print("Copy the 'Version Info URL' above and update 'components/AutoUpdater.tsx':")
    print(f'const VERSION_JSON_URL = "{version_url}";')
    print("=" * 60)

if __name__ == '__main__':
    main()
