# Deployment Scripts Documentation

## Overview

Two deployment scripts are available for building and uploading your APK to Google Drive:

1. **`deploy_fast.py`** - Optimized for speed (recommended)
2. **`deploy.py`** - Standard build with all ABIs

Both scripts now **automatically update BuildInfo.ts** with the current build timestamp.

---

## Quick Start

### Fast Deployment (Recommended)
```bash
source venv-deploy/bin/activate
python scripts/deploy_fast.py
```

**Expected Time**: ~2-3 minutes total
- Build: ~1-2 minutes
- Upload: ~30 seconds

### Standard Deployment
```bash
source venv-deploy/bin/activate
python scripts/deploy.py
```

**Expected Time**: ~5-7 minutes total
- Build: ~4-6 minutes
- Upload: ~30 seconds

---

## What Happens During Deployment

### Step 1: Update Build Timestamp ✨ NEW!
```
📝 Updating BuildInfo.ts with timestamp: 2025-12-02 13:43:13
✅ BuildInfo.ts updated
```

The script automatically writes the current timestamp to:
```typescript
// constants/BuildInfo.ts
export const BUILD_DATE = '2025-12-02 13:43:13';
```

This timestamp is then:
- Embedded in the APK during build
- Displayed in the app's menu
- Included in version.json for tracking

### Step 2: Build APK
```
================================================================================
BUILDING APK (OPTIMIZED)
================================================================================
Building for ABIs: arm64-v8a
Gradle cache: ENABLED
Configuration cache: ENABLED
Parallel workers: 4
--------------------------------------------------------------------------------
```

### Step 3: Authenticate with Google Drive
```
🔐 Authenticating with Google Drive...
```

Uses OAuth credentials from `credentials.json` and cached token from `token.json`.

### Step 4: Upload APK
```
📤 Uploading APK to Google Drive...
Updating existing file 'app-release.apk'...
✅ Uploaded in 25.3 seconds
```

### Step 5: Upload version.json
```
📤 Uploading version.json...
Updating existing file 'version.json'...
✅ Uploaded in 2.1 seconds
```

The version.json includes:
```json
{
  "version": "1.0.0",
  "apkUrl": "https://drive.google.com/uc?export=download&id=...",
  "note": "Automated build for version 1.0.0",
  "buildDate": "2025-12-02 13:43:13",
  "abis": "arm64-v8a"
}
```

### Step 6: Complete
```
🎉 DEPLOYMENT COMPLETE
================================================================================
Total Time: 142.5 seconds (2.4 minutes)
--------------------------------------------------------------------------------
App Version: 1.0.0
ABIs Built: arm64-v8a
APK Download URL:
  https://drive.google.com/uc?export=download&id=1B-28AXwxr6PEH2DMJyjuKzjCnxKkMkRU

Version Info URL:
  https://drive.google.com/uc?export=download&id=1j8BDEZBiNT8GdteTh0IJiYP9IKIqBDT5
================================================================================
```

---

## Customizing Builds

### Build for Multiple ABIs

```bash
# Only modern 64-bit devices (fastest, recommended)
BUILD_ABIS=arm64-v8a python scripts/deploy_fast.py

# Modern + older 32-bit devices
BUILD_ABIS=arm64-v8a,armeabi-v7a python scripts/deploy_fast.py

# All ABIs (slowest, rarely needed)
BUILD_ABIS=armeabi-v7a,arm64-v8a,x86,x86_64 python scripts/deploy_fast.py
```

---

## Build Output Details

### APK Location
```
android/app/build/outputs/apk/release/app-release.apk
```

### Build Info Location
```
constants/BuildInfo.ts
```

### Temporary Files
```
version.json (created and deleted during upload)
```

---

## Version.json Structure

The version.json file uploaded to Google Drive contains:

```json
{
  "version": "1.0.0",              // From app.json
  "apkUrl": "https://...",         // Google Drive direct download URL
  "note": "Automated build...",    // Build description
  "buildDate": "2025-12-02 13:43", // Timestamp from BuildInfo.ts
  "abis": "arm64-v8a"             // ABIs included in this build
}
```

This file is used by:
1. **AutoUpdater** - To check for new versions
2. **Users** - To know when the build was created
3. **Tracking** - To identify which ABIs are in the APK

---

## Troubleshooting

### Issue: "BuildInfo.ts not found"
```bash
# Create the file
mkdir -p constants
echo "export const BUILD_DATE = '2025-01-01 00:00:00';" > constants/BuildInfo.ts
```

### Issue: "Permission denied"
```bash
# Make scripts executable
chmod +x scripts/deploy_fast.py
chmod +x scripts/deploy.py
```

### Issue: "credentials.json not found"
1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 credentials (Desktop app)
3. Download as `credentials.json`
4. Place in project root

### Issue: "Build failed"
```bash
# Clean Gradle cache
cd android
./gradlew clean
./gradlew cleanBuildCache
cd ..

# Try again
python scripts/deploy_fast.py
```

---

## Performance Comparison

| Script | ABIs | Build Time | APK Size | Total Time |
|--------|------|------------|----------|------------|
| deploy_fast.py | 1 | ~1-2 min | ~50 MB | ~2-3 min |
| deploy.py | 4 | ~4-6 min | ~98 MB | ~5-7 min |

**Recommendation**: Use `deploy_fast.py` for 99% of deployments.

---

## What Changed (Auto-Update Feature)

### Before:
- Build timestamp was manually updated
- Easy to forget to update before building
- Inconsistent timestamps

### After:
```python
# Both scripts now call update_build_info() automatically
def main():
    version = get_version()

    # ✨ NEW: Auto-update build timestamp
    build_time = update_build_info()

    # Build with correct timestamp
    build_apk()

    # Upload to Google Drive
    # ...
```

### Benefits:
- ✅ Always accurate build timestamps
- ✅ No manual updates needed
- ✅ Timestamp in APK matches version.json
- ✅ Consistent across all builds

---

## Files Modified

1. **scripts/deploy_fast.py**
   - Added `update_build_info()` function
   - Calls it before building
   - Includes timestamp in version.json

2. **scripts/deploy.py**
   - Added `update_build_info()` function
   - Calls it before building
   - Includes timestamp in version.json

3. **constants/BuildInfo.ts**
   - Auto-updated by scripts
   - Contains current build timestamp
   - Used in app menu

---

## Next Steps

1. Run a test build:
   ```bash
   source venv-deploy/bin/activate
   python scripts/deploy_fast.py
   ```

2. Check the app menu to verify timestamp is correct

3. Verify version.json includes buildDate field

4. Celebrate faster builds! 🎉
