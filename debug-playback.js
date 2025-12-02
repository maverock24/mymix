const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function debugPlayback() {
  console.log('🔍 Starting playback debugging...\n');

  const browser = await chromium.launch({
    headless: false, // Show browser for debugging
    args: ['--disable-web-security'] // Allow file access
  });

  const context = await browser.newContext({
    viewport: { width: 375, height: 667 }, // Mobile viewport
    permissions: ['microphone'], // Audio permissions
  });

  const page = await context.newPage();

  // Collect console logs
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    console.log(`[BROWSER ${msg.type()}]`, text);
  });

  // Collect errors
  const errors = [];
  page.on('pageerror', error => {
    errors.push(error.toString());
    console.error('❌ [PAGE ERROR]', error);
  });

  // Track network requests
  page.on('request', request => {
    if (request.url().includes('.mp3') || request.url().includes('audio')) {
      console.log('🎵 [AUDIO REQUEST]', request.url());
    }
  });

  page.on('response', async response => {
    if (response.url().includes('.mp3') || response.url().includes('audio')) {
      console.log(`🎵 [AUDIO RESPONSE] ${response.status()} ${response.url()}`);
    }
  });

  try {
    // Navigate to the app
    console.log('📱 Navigating to http://localhost:8081/...\n');
    await page.goto('http://localhost:8081/', { waitUntil: 'networkidle' });

    // Wait for app to load
    console.log('⏳ Waiting for app to load...\n');
    await page.waitForTimeout(3000);

    // Take initial screenshot
    await page.screenshot({ path: 'debug-initial.png' });
    console.log('📸 Screenshot saved: debug-initial.png\n');

    // Check if we're on the main screen
    const mainPlayerVisible = await page.locator('text=Main').isVisible().catch(() => false);
    console.log('✓ Main player visible:', mainPlayerVisible);

    // Look for the file load button (📁)
    const loadButton = page.locator('text=📁').first();
    const loadButtonVisible = await loadButton.isVisible().catch(() => false);
    console.log('✓ Load button visible:', loadButtonVisible);

    if (loadButtonVisible) {
      console.log('\n📂 Attempting to click load button...');
      await loadButton.click();
      await page.waitForTimeout(1000);

      // Take screenshot after clicking load
      await page.screenshot({ path: 'debug-after-load-click.png' });
      console.log('📸 Screenshot saved: debug-after-load-click.png\n');
    }

    // Check for file input
    const fileInput = page.locator('input[type="file"]');
    const fileInputExists = await fileInput.count() > 0;
    console.log('✓ File input exists:', fileInputExists);

    if (fileInputExists) {
      // Create a test MP3 file path (you'll need to provide actual MP3 files)
      console.log('\n🎵 Note: To test file upload, you need to provide MP3 files');
      console.log('   Example: const testFiles = [\'/path/to/test.mp3\'];');
      console.log('   Then use: await fileInput.setInputFiles(testFiles);\n');
    }

    // Check for play button
    const playButton = page.locator('text=▶️, text=⏸️').first();
    const playButtonVisible = await playButton.isVisible().catch(() => false);
    console.log('✓ Play button visible:', playButtonVisible);

    if (playButtonVisible) {
      console.log('\n▶️  Attempting to click play button...');
      await playButton.click();
      await page.waitForTimeout(2000);

      // Take screenshot after play click
      await page.screenshot({ path: 'debug-after-play-click.png' });
      console.log('📸 Screenshot saved: debug-after-play-click.png\n');
    }

    // Wait a bit to see if any errors occur
    console.log('⏳ Waiting for potential errors...\n');
    await page.waitForTimeout(3000);

    // Check console for specific player logs
    const playerLogs = logs.filter(log => log.includes('[Player'));
    if (playerLogs.length > 0) {
      console.log('\n📊 Player-specific logs:');
      playerLogs.forEach(log => console.log('  ', log));
    }

    // Check for errors
    if (errors.length > 0) {
      console.log('\n❌ Errors detected:');
      errors.forEach(err => console.log('  ', err));
    }

    // Save all logs to file
    const logOutput = {
      timestamp: new Date().toISOString(),
      logs,
      errors,
      playerLogs,
    };

    fs.writeFileSync('debug-logs.json', JSON.stringify(logOutput, null, 2));
    console.log('\n💾 All logs saved to: debug-logs.json');

    // Final screenshot
    await page.screenshot({ path: 'debug-final.png', fullPage: true });
    console.log('📸 Final screenshot saved: debug-final.png\n');

    console.log('✅ Debugging complete! Check the screenshots and debug-logs.json for details.\n');
    console.log('Press Ctrl+C to close the browser or it will close in 10 seconds...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('\n❌ Fatal error during debugging:', error);
    await page.screenshot({ path: 'debug-error.png' });
    console.log('📸 Error screenshot saved: debug-error.png');
  } finally {
    await browser.close();
  }
}

// Run the debug script
debugPlayback().catch(console.error);
