# Build Optimization Guide

This guide explains how to make the build and upload process faster.

## Current Build Time Analysis

The build process has several stages:
1. **Gradle Configuration** (~10-20 seconds)
2. **Native Code Compilation** (~2-3 minutes) - SLOWEST
3. **Java/Kotlin Compilation** (~30-60 seconds)
4. **APK Assembly** (~10-20 seconds)
5. **Upload to Google Drive** (~30-60 seconds depending on connection)

**Total Current Time**: ~4-6 minutes

## Quick Wins (Implement These First)

### 1. Build Only Necessary ABIs (70% faster builds)

Currently building for 4 ABIs. Most users only need `arm64-v8a`.

**Current ABIs**: armeabi-v7a, arm64-v8a, x86, x86_64
**Recommended**: arm64-v8a only (covers 95%+ of modern Android devices)

**Implementation**:
Edit `android/gradle.properties` line 31:
```properties
# Old:
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64

# New (for production):
reactNativeArchitectures=arm64-v8a

# Or keep arm64 + armv7 for older device support:
reactNativeArchitectures=arm64-v8a,armeabi-v7a
```

**Time Saved**: ~2-3 minutes (60-70% reduction)

### 2. Enable Gradle Build Cache

Add to `android/gradle.properties`:
```properties
# Enable Gradle caching
org.gradle.caching=true
org.gradle.configuration-cache=true

# Increase Gradle daemon memory
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError

# Use more workers
org.gradle.workers.max=4
```

**Time Saved**: 30-60 seconds on repeated builds

### 3. Use NDK Build Cache (ccache)

Install and configure ccache for native code compilation:

```bash
# Install ccache
sudo apt-get install ccache

# Add to android/gradle.properties
android.ndkCacheDir=/home/maverock24/.ccache
```

Create `~/.ccache/ccache.conf`:
```
max_size = 10.0G
compression = true
```

**Time Saved**: 1-2 minutes on repeated builds

### 4. Skip Unnecessary Tasks

The deploy script already skips lint and tests. Additional optimizations:

```bash
# In deploy.py, update the gradle command:
subprocess.check_call([
    './gradlew',
    'assembleRelease',
    '--parallel',
    '--build-cache',
    '--configuration-cache',
    '-x', 'lint',
    '-x', 'test',
    '-Dorg.gradle.jvmargs=-Xmx4096m',
    '-Dorg.gradle.workers.max=4'
], cwd=ANDROID_DIR)
```

**Time Saved**: 20-40 seconds

## Medium Optimizations

### 5. Use App Bundle Instead of APK

AAB files are smaller and faster to build:

```bash
./gradlew bundleRelease
```

**Note**: Requires Google Play Store for distribution, won't work for direct APK downloads.

### 6. Optimize ProGuard/R8

Create/update `android/app/proguard-rules.pro`:
```proguard
# Optimize more aggressively
-optimizationpasses 5
-allowaccessmodification
```

Add to `android/app/build.gradle`:
```gradle
buildTypes {
    release {
        minifyEnabled true
        shrinkResources true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

**Result**: Smaller APK (~20-30% reduction), slightly longer build time

### 7. Parallel Upload with Compression

Update the deploy script to use compression:

```python
def upload_file_compressed(service, file_path, name, mime_type):
    import gzip
    import tempfile

    # Compress APK before upload
    compressed_path = tempfile.mktemp(suffix='.gz')
    with open(file_path, 'rb') as f_in:
        with gzip.open(compressed_path, 'wb') as f_out:
            f_out.writelines(f_in)

    # Upload compressed file
    # Then decompress on download
```

**Note**: Google Drive already compresses files, so this may not help much.

## Advanced Optimizations

### 8. Use Remote Build Cache

Set up a local or cloud-based Gradle build cache server:

```properties
# In gradle.properties
org.gradle.caching=true

# In settings.gradle
buildCache {
    local {
        enabled = true
        directory = file('/path/to/build-cache')
        removeUnusedEntriesAfterDays = 30
    }
}
```

### 9. Use Gradle Profiling

Analyze where time is spent:

```bash
./gradlew assembleRelease --profile --scan
```

This creates a report showing which tasks take the longest.

### 10. CI/CD with GitHub Actions

Instead of building locally, use GitHub Actions with caching:

```yaml
# .github/workflows/build.yml
name: Build and Deploy

on:
  push:
    branches: [master]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup JDK
        uses: actions/setup-java@v3
        with:
          java-version: '17'

      - name: Setup Gradle Cache
        uses: gradle/gradle-build-action@v2
        with:
          cache-read-only: false

      - name: Build APK
        run: |
          cd android
          ./gradlew assembleRelease \
            -PreactNativeArchitectures=arm64-v8a \
            --parallel \
            --build-cache

      - name: Upload to Google Drive
        run: python scripts/deploy.py
```

**Benefits**:
- Faster builds on GitHub's infrastructure
- Persistent caching between builds
- No local resource usage

## Expected Results After All Quick Wins

| Optimization | Time Saved |
|--------------|------------|
| Single ABI build | 2-3 minutes |
| Gradle caching | 30-60 seconds |
| ccache for NDK | 1-2 minutes |
| Skip tasks | 20-40 seconds |
| **Total Saved** | **4-6 minutes** |

**New Build Time**: ~1-2 minutes (from ~4-6 minutes)

## Recommended Configuration

For fastest builds with good device coverage:

### gradle.properties
```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.configuration-cache=true
org.gradle.workers.max=4

# Build only for modern devices (95%+ coverage)
reactNativeArchitectures=arm64-v8a

# Optional: Include armv7 for older devices
# reactNativeArchitectures=arm64-v8a,armeabi-v7a
```

### deploy.py optimization
```python
subprocess.check_call([
    './gradlew',
    'assembleRelease',
    '--parallel',
    '--build-cache',
    '--configuration-cache',
    '-x', 'lint',
    '-x', 'test',
    '-x', 'lintVitalRelease',
    f'-PreactNativeArchitectures={os.environ.get("BUILD_ABIS", "arm64-v8a")}'
], cwd=ANDROID_DIR)
```

## Incremental Builds

For development/testing, you can do even faster incremental builds:

```bash
# Only build what changed
./gradlew assembleRelease --no-rebuild

# Or use bundle for faster builds
./gradlew bundleRelease
```

## Monitoring Build Performance

```bash
# See what's taking time
./gradlew assembleRelease --profile --offline --rerun-tasks

# Check Gradle daemon status
./gradlew --status

# Clean Gradle cache if builds get slow
./gradlew cleanBuildCache
```
