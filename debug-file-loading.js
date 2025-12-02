const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function debugFileLoading() {
  console.log('🔍 Testing MP3 file loading...\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-web-security', '--allow-file-access-from-files']
  });

  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
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

  try {
    console.log('📱 Navigating to http://localhost:8081/...\n');
    await page.goto('http://localhost:8081/', { waitUntil: 'networkidle' });

    console.log('⏳ Waiting for app to load...\n');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'debug-step1-initial.png' });
    console.log('📸 Screenshot: debug-step1-initial.png\n');

    // Find and click the folder button for Player 1
    console.log('🔍 Looking for folder button...');
    const folderButton = page.locator('text=📁').first();
    const isVisible = await folderButton.isVisible();
    console.log('✓ Folder button visible:', isVisible);

    if (!isVisible) {
      console.error('❌ Folder button not found!');
      await page.screenshot({ path: 'debug-error-no-button.png' });
      return;
    }

    console.log('\n📂 Clicking folder button...');
    await folderButton.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'debug-step2-after-click.png' });
    console.log('📸 Screenshot: debug-step2-after-click.png\n');

    // Check for file input
    console.log('🔍 Looking for file input...');
    const fileInput = page.locator('input[type="file"]');
    const fileInputCount = await fileInput.count();
    console.log('✓ File input count:', fileInputCount);

    if (fileInputCount === 0) {
      console.error('❌ No file input found!');

      // Check what's actually on the page
      const bodyText = await page.locator('body').textContent();
      console.log('\n📄 Page content preview:', bodyText.substring(0, 500));

      await page.screenshot({ path: 'debug-error-no-input.png' });
      return;
    }

    // Get the file input attributes
    const inputAttrs = await fileInput.first().evaluate(el => ({
      type: el.type,
      accept: el.accept,
      multiple: el.multiple,
      webkitdirectory: el.webkitdirectory || el.getAttribute('webkitdirectory'),
      directory: el.directory || el.getAttribute('directory')
    }));

    console.log('📋 File input attributes:', inputAttrs);

    // Create test MP3 files (silent audio)
    console.log('\n🎵 Creating test MP3 files...');
    const testDir = path.join(__dirname, 'test-audio');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
    }

    // Create a minimal valid MP3 file (ID3 header + silence)
    const mp3Header = Buffer.from([
      0xFF, 0xFB, 0x90, 0x00, // MP3 frame sync + MPEG1 Layer 3
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);

    const testFiles = ['test1.mp3', 'test2.mp3', 'test3.mp3'];
    testFiles.forEach(filename => {
      const filepath = path.join(testDir, filename);
      fs.writeFileSync(filepath, mp3Header);
      console.log(`  ✓ Created: ${filepath}`);
    });

    // Upload the test files
    console.log('\n📤 Uploading test files...');
    const filePaths = testFiles.map(f => path.join(testDir, f));

    try {
      await fileInput.first().setInputFiles(filePaths);
      console.log('✓ Files set on input element');
    } catch (error) {
      console.error('❌ Error setting files:', error.message);
    }

    // Wait for processing
    console.log('\n⏳ Waiting for files to process...');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'debug-step3-after-upload.png' });
    console.log('📸 Screenshot: debug-step3-after-upload.png\n');

    // Check for loading indicators
    console.log('🔍 Checking for loading indicators...');
    const loadingIndicator = await page.locator('text=/Loading|loading/i').count();
    console.log('✓ Loading indicator count:', loadingIndicator);

    // Check for track list
    console.log('\n🔍 Checking for loaded tracks...');
    const trackElements = await page.locator('text=/test1|test2|test3/i').count();
    console.log('✓ Track elements found:', trackElements);

    // Look for any text content in the player areas
    const player1Content = await page.locator('text=Main').locator('..').textContent();
    console.log('\n📄 Player 1 content:', player1Content.substring(0, 300));

    // Check specific log messages
    const filePickingLogs = logs.filter(log =>
      log.includes('Loading playlist') ||
      log.includes('Picked') ||
      log.includes('tracks') ||
      log.includes('Loading track')
    );

    if (filePickingLogs.length > 0) {
      console.log('\n📊 File picking logs:');
      filePickingLogs.forEach(log => console.log('  ', log));
    } else {
      console.log('\n⚠️  No file picking logs found - files may not be loading');
    }

    // Wait a bit more to see final state
    console.log('\n⏳ Waiting for final state...');
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'debug-step4-final.png', fullPage: true });
    console.log('📸 Screenshot: debug-step4-final.png\n');

    // Save logs
    const logOutput = {
      timestamp: new Date().toISOString(),
      logs,
      errors,
      filePickingLogs,
      testFilesCreated: testFiles,
    };

    fs.writeFileSync('debug-file-loading-logs.json', JSON.stringify(logOutput, null, 2));
    console.log('💾 Logs saved to: debug-file-loading-logs.json\n');

    if (errors.length > 0) {
      console.log('\n❌ Errors detected:');
      errors.forEach(err => console.log('  ', err));
    }

    console.log('\n✅ Testing complete!');
    console.log('Press Ctrl+C to close or waiting 10 seconds...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    await page.screenshot({ path: 'debug-fatal-error.png' });
  } finally {
    await browser.close();
  }
}

debugFileLoading().catch(console.error);
