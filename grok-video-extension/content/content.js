// Content script for automating Grok video generation

console.log('Grok Imagine Assistant content script loaded');
console.log('Current URL:', window.location.href);
console.log('Document ready state:', document.readyState);

// Add error listener for debugging 403 errors
window.addEventListener('error', (event) => {
  if (event.message && event.message.includes('403')) {
    console.log('Detected 403 error (likely from Grok resources, can be ignored):', event.message);
    // Don't propagate - these are usually Grok's own resources
    return true;
  }
}, true);

// Listen for job messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    // Respond to ping to confirm content script is loaded
    sendResponse({ ready: true });
    return true;
  } else if (message.type === 'START_JOB') {
    console.log('Starting job:', message.job.job_id);
    console.log('Job details:', {
      prompt: message.job.prompt,
      hasImage: !!message.job.image,
      timeout: message.job.videoTimeoutSeconds
    });
    processVideoJob(message.job);
  } else if (message.type === 'START_CHAT_JOB') {
    console.log('Starting chat job:', message.job.job_id);
    processChatJob(message.job);
  } else if (message.type === 'EXTRACT_VIDEO') {
    console.log('Extracting video from current page...');
    extractVideoFromPage()
      .then(videoUrl => {
        console.log('✓ Video extracted:', videoUrl);
        sendResponse({ success: true, videoUrl: videoUrl });
      })
      .catch(error => {
        console.error('✗ Video extraction failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
});

// Main job processing function
async function processVideoJob(job) {
  console.log('=== Starting job processing ===');
  console.log('Job ID:', job.job_id);
  console.log('Prompt:', job.prompt);
  console.log('Has image:', !!job.image);

  try {
    updateStatus('Initializing...');
    await sleep(1000);

    // 0. Navigate to main imagine page if on post page
    console.log('Step 0: Ensuring we are on main imagine page...');
    updateStatus('Navigating to imagine page...');
    await navigateToVideoImaginePage();
    console.log('✓ On main imagine page');

    // 1. Find prompt input
    console.log('Step 1: Finding prompt input...');
    updateStatus('Finding prompt input...');
    await waitForDocumentComplete();
    let promptInput = await findVideoPromptInput();
    if (!promptInput) {
      throw new Error('Prompt input not found. Is Grok Imagine page fully loaded?');
    }
    console.log('✓ Found prompt input:', promptInput.tagName);

    // 2. Upload image if provided
    if (job.image) {
      console.log('Step 2: Uploading image...');
      updateStatus('Uploading image...');
      try {
        await uploadImageToGrok(job.image);
        console.log('✓ Image uploaded successfully');

        // Wait for page to navigate to new URL with image UUID
        console.log('Step 2.1: Waiting for URL to update to imagine/post/{UUID}...');
        updateStatus('Waiting for image page to load...');
        await waitForVideoImagePageLoad();
        console.log('✓ Image page loaded with UUID');

        // Wait for "Make a video" textarea to appear on the new page
        console.log('Step 2.2: Waiting for "Make a video" textarea...');
        updateStatus('Finding video prompt input...');
        await waitForDocumentComplete();
        const videoPromptInput = await findMakeVideoTextarea();
        if (!videoPromptInput) {
          throw new Error('Make a video textarea not found after image upload');
        }
        console.log('✓ Found "Make a video" textarea');

        // Update promptInput to the new textarea
        promptInput = videoPromptInput;

      } catch (imageError) {
        console.error('Image upload failed:', imageError);
        throw new Error(`Image upload failed: ${imageError.message}`);
      }
    } else {
      console.log('Step 2: Skipping image upload (no image provided)');
    }

    // 3. Insert prompt text into "Make a video" textarea
    console.log('Step 3: Entering prompt into textarea...');
    updateStatus('Entering prompt...');
    await insertTextFast(promptInput, job.prompt);
    console.log('✓ Prompt entered');
    await sleep(5000);

    // 4. Find and click submit button
    console.log('Step 4: Finding and clicking submit button...');
    updateStatus('Submitting request...');
    await waitForDocumentComplete();
    const submitBtn = await findVideoSubmitButton();
    if (!submitBtn) {
      throw new Error('Submit button not found. Grok UI may have changed.');
    }
    console.log('✓ Found submit button:', submitBtn);
    await simulateClick(submitBtn);
    console.log('✓ Submit button clicked');
    await sleep(1000);

    // 5. Wait for video generation
    console.log('Step 5: Waiting for video generation...');
    updateStatus('Waiting for video generation...');
    await waitForDocumentComplete();
    const timeout = (job.videoTimeoutSeconds || 300) * 1000;
    console.log('Timeout:', timeout / 1000, 'seconds');
    const videoUrl = await waitForVideoResponse(timeout);
    console.log('✓ Video generated:', videoUrl);

    // 6. Download video as blob
    console.log('Step 6: Downloading video blob...');
    console.log('Video URL:', videoUrl);
    updateStatus('Downloading video...');

    // Fetch with credentials to include cookies for authenticated URLs
    const videoResponse = await fetch(videoUrl, {
      method: 'GET',
      credentials: 'include',  // Include cookies for authentication
      mode: 'cors'
    });

    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
    }

    const videoBlob = await videoResponse.blob();
    console.log('✓ Video downloaded, size:', videoBlob.size, 'bytes');

    if (videoBlob.size === 0) {
      throw new Error('Downloaded video is empty (0 bytes)');
    }

    // 7. Convert blob to Uint8Array for message passing (ArrayBuffer doesn't survive chrome.runtime.sendMessage)
    console.log('Step 7: Converting blob to Uint8Array...');
    const videoArrayBuffer = await videoBlob.arrayBuffer();
    const videoUint8Array = new Uint8Array(videoArrayBuffer);
    console.log('✓ Converted to Uint8Array');
    console.log('  - length:', videoUint8Array.length, 'bytes');
    console.log('  - constructor:', videoUint8Array.constructor.name);
    console.log('  - first 10 bytes:', Array.from(videoUint8Array.slice(0, 10)));

    // 8. Send to background for upload
    console.log('Step 8: Sending to background for upload...');
    console.log('Message payload:');
    console.log('  - jobId:', job.job_id);
    console.log('  - videoType:', videoBlob.type || 'video/mp4');
    console.log('  - videoData length:', videoUint8Array.length);

    chrome.runtime.sendMessage({
      type: 'JOB_COMPLETED',
      jobId: job.job_id,
      videoData: Array.from(videoUint8Array), // Convert to plain array for message passing
      videoType: videoBlob.type || 'video/mp4'
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Message sending error:', chrome.runtime.lastError);
      } else {
        console.log('Message sent successfully, response:', response);
      }
    });

    updateStatus('Completed!');
    await sleep(1000);
    await prepareVideoForNextUse();
    console.log('=== Job completed successfully ===');

  } catch (error) {
    console.error('=== Job processing failed ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);

    chrome.runtime.sendMessage({
      type: 'JOB_FAILED',
      jobId: job.job_id,
      error: error.message
    });
  }
}

// Find prompt input textarea
async function findVideoPromptInput(maxAttempts = 10) {
  console.log('Searching for prompt input...');
  await waitForDocumentComplete();

  for (let i = 0; i < maxAttempts; i++) {
    console.log(`Attempt ${i + 1}/${maxAttempts}...`);

    // Try multiple selectors for Grok Imagine page prompt input
    // Most specific selectors first!
    const selectors = [
      'p[data-placeholder="Type to imagine"]',  // Grok Imagine page editor (MOST SPECIFIC)
      '[data-placeholder*="imagine"]',  // Alternative imagine selector
      'textarea[aria-label="Make a video"]',  // Older video generation textarea
      '.ProseMirror [contenteditable="true"]',  // ProseMirror editor
      '[contenteditable="true"]',  // Any contenteditable element
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) {
        console.log('✓ Found prompt input with selector:', selector);
        console.log('  Tag:', element.tagName);
        console.log('  Aria-label:', element.getAttribute('aria-label'));
        console.log('  Placeholder:', element.placeholder);
        console.log('  Classes:', element.className);
        return element;
      }
    }

    await sleep(1000);
  }

  console.error('✗ Prompt input not found after', maxAttempts, 'attempts');
  console.log('Available textareas:', document.querySelectorAll('textarea').length);
  console.log('Available contenteditable:', document.querySelectorAll('[contenteditable="true"]').length);

  return null;
}

// Find submit button
async function findVideoSubmitButton(maxAttempts = 10) {
  console.log('Searching for submit button...');
  await waitForDocumentComplete();

  for (let i = 0; i < maxAttempts; i++) {
    console.log(`Attempt ${i + 1}/${maxAttempts}...`);

    // Try multiple selectors for submit button
    // Most specific first
    const selectors = [
      'button[aria-label*="Make video"]',  // Grok video generation button
      'button[aria-label*="Generate"]',    // Alternative generate button
      'button[type="submit"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="Submit"]',
      'button:has(svg)',
      'button.send-button',
      '[data-testid*="send"]',
      'button:not([disabled])'  // Any enabled button as last resort
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (element.offsetParent !== null && !element.disabled) {
          console.log('✓ Found submit button with selector:', selector);
          console.log('  Tag:', element.tagName);
          console.log('  Aria-label:', element.getAttribute('aria-label'));
          console.log('  Type:', element.type);
          console.log('  Classes:', element.className);
          console.log('  Text:', element.textContent?.trim().substring(0, 50));
          return element;
        }
      }
    }

    await sleep(1000);
  }

  console.error('✗ Submit button not found after', maxAttempts, 'attempts');
  console.log('Available buttons:', document.querySelectorAll('button').length);
  console.log('Enabled buttons:', document.querySelectorAll('button:not([disabled])').length);

  return null;
}

// Insert text fast (from original extension)
async function insertTextFast(element, text) {
  // Focus element
  element.focus();
  await sleep(100);

  // Set value directly
  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    ).set;
    nativeInputValueSetter.call(element, text);

    // Trigger input event
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (element.contentEditable === 'true') {
    // For contenteditable divs
    element.textContent = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  await sleep(200);
}

// Upload image to Grok (from original extension)
async function uploadImageToGrok(base64Image) {
  await waitForDocumentComplete();
  // Step 2.1: Find and click the Attach button
  console.log('Step 2.1: Finding Attach button...');
  const attachButton = await findAttachButton();
  if (!attachButton) {
    throw new Error('Attach button not found on Grok Imagine page');
  }
  console.log('✓ Found Attach button');

  // Click the attach button to open file picker
  await simulateClick(attachButton);
  console.log('✓ Clicked Attach button');
  await sleep(500);

  // Step 2.2: Find file input (should appear after clicking attach)
  console.log('Step 2.2: Finding file input...');
  await waitForDocumentComplete();
  const fileInput = await findFileInput();
  if (!fileInput) {
    throw new Error('File input not found after clicking Attach');
  }
  console.log('✓ Found file input');

  // Convert base64 to blob
  const blob = await base64ToBlob(base64Image);

  // Create File object
  const file = new File([blob], 'image.png', { type: 'image/png' });

  // Create DataTransfer
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  // Set files
  fileInput.files = dataTransfer.files;

  // Trigger change event
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));

  console.log('✓ Image uploaded successfully');
}

// Find Attach button on Grok Imagine page
async function findAttachButton(maxAttempts = 10) {
  console.log('Searching for Attach button...');
  await waitForDocumentComplete();

  for (let i = 0; i < maxAttempts; i++) {
    console.log(`Attempt ${i + 1}/${maxAttempts}...`);

    // Specific selectors for Grok Imagine page attach button
    const selectors = [
      'button[aria-label="Attach"]',  // Most specific
      'button.group\\/attach-button',  // Class-based selector
      'button[type="button"][aria-label="Attach"]',  // More specific
      'button[aria-label="Attach"][type="button"]',  // Explicit type + aria
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null && !element.disabled) {
        console.log('✓ Found Attach button with selector:', selector);
        console.log('  Tag:', element.tagName);
        console.log('  Aria-label:', element.getAttribute('aria-label'));
        console.log('  Classes:', element.className.substring(0, 100));
        return element;
      }
    }

    await sleep(1000);
  }

  console.error('✗ Attach button not found after', maxAttempts, 'attempts');
  return null;
}

// Find Back button on Grok Imagine post page
async function findBackButton(maxAttempts = 10) {
  console.log('Searching for Back button...');
  await waitForDocumentComplete();

  for (let i = 0; i < maxAttempts; i++) {
    console.log(`Attempt ${i + 1}/${maxAttempts}...`);

    // Specific selectors for back button
    const selectors = [
      'button[aria-label="Back"]',  // Most specific
      'button[data-slot="button"][aria-label="Back"]',  // More specific with data-slot
      'button.sticky[aria-label="Back"]',  // With position class
      'button:has(svg.lucide-arrow-left)',  // Has arrow left icon
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null && !element.disabled) {
        console.log('✓ Found Back button with selector:', selector);
        console.log('  Tag:', element.tagName);
        console.log('  Aria-label:', element.getAttribute('aria-label'));
        console.log('  Classes:', element.className.substring(0, 100));
        return element;
      }
    }

    await sleep(1000);
  }

  console.error('✗ Back button not found after', maxAttempts, 'attempts');
  return null;
}

// Find file input
async function findFileInput(maxAttempts = 10) {
  console.log('Searching for file input...');
  await waitForDocumentComplete();

  for (let i = 0; i < maxAttempts; i++) {
    console.log(`Attempt ${i + 1}/${maxAttempts}...`);

    const selectors = [
      'input[type="file"][accept*="image"]',  // Most specific
      'input[type="file"]',
      'input[accept*="image"]',
      '[data-testid*="upload"]',
      '[data-testid*="file"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log('✓ Found file input with selector:', selector);
        console.log('  Tag:', element.tagName);
        console.log('  Type:', element.type);
        console.log('  Accept:', element.accept);
        return element;
      }
    }

    await sleep(500);  // Shorter wait since we just clicked attach
  }

  console.error('✗ File input not found after', maxAttempts, 'attempts');
  console.log('Available file inputs:', document.querySelectorAll('input[type="file"]').length);

  return null;
}

// Convert base64 to blob
async function base64ToBlob(base64) {
  const isDataUrl = base64.startsWith('data:');
  const dataUrl = isDataUrl ? base64 : `data:image/png;base64,${base64}`;
  const response = await fetch(dataUrl);
  return await response.blob();
}

// Simulate click (from original extension)
async function simulateClick(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  // Mouse events
  const mouseDown = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y
  });

  const mouseUp = new MouseEvent('mouseup', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y
  });

  const click = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y
  });

  element.dispatchEvent(mouseDown);
  await sleep(50);
  element.dispatchEvent(mouseUp);
  await sleep(50);
  element.dispatchEvent(click);
}

// Wait for video response (adapted from original extension)
async function waitForVideoResponse(timeout = 120000) {
  await waitForDocumentComplete();
  const startTime = Date.now();
  let lastStatus = '';

  console.log('Waiting for video, timeout:', timeout / 1000, 'seconds');

  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);

      // Check for timeout
      if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        console.error('✗ Video generation timed out after', elapsed, 'seconds');
        reject(new Error('Video generation timed out'));
        return;
      }

      // Log progress every 10 seconds
      if (elapsed % 10 === 0 && elapsed > 0) {
        const status = `Still waiting... (${elapsed}s / ${timeout / 1000}s)`;
        if (status !== lastStatus) {
          console.log(status);
          lastStatus = status;
        }
      }

      // Try to find video element
      const videoElement = findVideoElement();
      if (videoElement) {
        clearInterval(checkInterval);
        console.log('✓ Video element found after', elapsed, 'seconds');

        // Get video source URL
        const videoUrl = videoElement.src || videoElement.querySelector('source')?.src;
        console.log('Video URL:', videoUrl);

        // Accept blob URLs and HTTPS URLs from Grok's asset servers
        const isValidUrl = videoUrl && (
          videoUrl.startsWith('blob:') ||
          videoUrl.startsWith('https://assets.grok.com') ||
          videoUrl.startsWith('https://imagine-public.x.ai')
        );

        if (isValidUrl) {
          console.log('✓ Valid video URL found');
          resolve(videoUrl);
        } else {
          console.error('✗ Invalid video URL:', videoUrl);
          reject(new Error('Invalid video URL - expected blob:, assets.grok.com, or imagine-public.x.ai URL'));
        }
        return;
      }

      // Check for error messages
      const errorElement = document.querySelector('[data-error], .error-message, [role="alert"]');
      if (errorElement && errorElement.textContent.toLowerCase().includes('error')) {
        clearInterval(checkInterval);
        const errorText = errorElement.textContent.trim();
        console.error('✗ Grok error detected:', errorText);
        reject(new Error(`Grok error: ${errorText}`));
        return;
      }

      // Check for rate limit messages
      const rateLimitElement = Array.from(document.querySelectorAll('*')).find(el => {
        const text = el.textContent.toLowerCase();
        return text.includes('rate limit') ||
               text.includes('too many requests') ||
               text.includes('please try again later');
      });

      if (rateLimitElement) {
        clearInterval(checkInterval);
        console.error('✗ Rate limit detected');
        reject(new Error('Rate limit reached - please wait before submitting more jobs'));
        return;
      }

      // Check for content moderation
      const moderationElement = Array.from(document.querySelectorAll('*')).find(el => {
        const text = el.textContent.toLowerCase();
        return text.includes('content policy') ||
               text.includes('violates') ||
               text.includes('not allowed');
      });

      if (moderationElement) {
        clearInterval(checkInterval);
        console.error('✗ Content moderation triggered');
        reject(new Error('Content moderation: prompt may violate policies'));
        return;
      }

    }, 1000); // Check every second
  });
}

// Find video element
function findVideoElement() {
  // Try multiple selectors (prioritize videos with actual sources)
  const selectors = [
    'video[src^="https://assets.grok.com"]',  // HTTPS video URLs (assets CDN)
    'video source[src^="https://assets.grok.com"]',
    'video[src^="https://imagine-public.x.ai"]',  // HTTPS video URLs (x.ai CDN)
    'video source[src^="https://imagine-public.x.ai"]',
    'video[src^="blob:"]',  // Blob URLs (old format)
    'video source[src^="blob:"]',
    'video',  // Any video element
    '[data-video-container] video',
    '.video-output video'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      // Check if video has loaded
      const video = element.tagName === 'VIDEO' ? element : element.querySelector('video');
      if (video && video.readyState >= 2) { // HAVE_CURRENT_DATA
        return video;
      }
    }
  }

  return null;
}

// Extract video URL from current page (for manual download)
async function extractVideoFromPage() {
  console.log('Looking for video element on page...');
  await waitForDocumentComplete();

  // Find video element
  const videoElement = findVideoElement();

  if (!videoElement) {
    // Try waiting a bit for video to appear
    console.log('Video not immediately found, waiting...');
    await sleep(2000);

    const videoElementRetry = findVideoElement();
    if (!videoElementRetry) {
      throw new Error('No video element found on page. Make sure a video has been generated.');
    }

    const videoUrl = videoElementRetry.src || videoElementRetry.querySelector('source')?.src;
    if (!videoUrl) {
      throw new Error('Video element found but has no source URL');
    }

    console.log('✓ Video URL found:', videoUrl);
    return videoUrl;
  }

  // Get video source URL
  const videoUrl = videoElement.src || videoElement.querySelector('source')?.src;

  if (!videoUrl) {
    throw new Error('Video element found but has no source URL');
  }

  // Validate URL format (warn if unexpected but don't reject)
  if (!videoUrl.startsWith('blob:') &&
      !videoUrl.startsWith('https://assets.grok.com') &&
      !videoUrl.startsWith('https://imagine-public.x.ai')) {
    console.warn('Unexpected video URL format:', videoUrl);
  }

  console.log('✓ Video URL extracted:', videoUrl);
  return videoUrl;
}

// Wait for image page to load after upload
// Navigate to main imagine page if currently on a post page
async function navigateToVideoImaginePage(timeout = 10000) {
  const currentUrl = window.location.href;
  const postUrlPattern = /https:\/\/grok\.com\/imagine\/post\/[a-f0-9-]{36}/;

  console.log('Checking current URL:', currentUrl);

  // If already on main imagine page, no action needed
  if (currentUrl === 'https://grok.com/imagine' || currentUrl === 'https://grok.com/imagine/') {
    console.log('✓ Already on main imagine page');
    return;
  }

  // If on a post page, click back button
  if (postUrlPattern.test(currentUrl)) {
    console.log('⚠ Currently on post page, navigating back to main imagine page...');

    // Find and click back button
    const backButton = await findBackButton();
    if (!backButton) {
      throw new Error('Back button not found on post page');
    }

    console.log('✓ Found back button, clicking...');
    await simulateClick(backButton);
    await sleep(500);

    // Wait for navigation to complete
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const newUrl = window.location.href;
      if (newUrl.includes('grok.com/imagine') && !newUrl.includes('/post/')) {
        console.log('✓ Successfully navigated back to:', newUrl);
        await sleep(1000); // Wait for page to stabilize
        return;
      }
      await sleep(100);
    }

    throw new Error('Timeout waiting for navigation back to imagine page');
  }

  // If on some other imagine-related page, we're probably okay
  if (currentUrl.includes('grok.com/imagine')) {
    console.log('✓ On imagine page (variant)');
    return;
  }

  throw new Error(`Unexpected URL: ${currentUrl}. Expected https://grok.com/imagine`);
}

async function waitForVideoImagePageLoad(timeout = 30000) {
  const startTime = Date.now();

  console.log('Waiting for URL to change to /imagine/post/{UUID}...');

  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      const currentUrl = window.location.href;
      const elapsed = Date.now() - startTime;

      // Check for timeout
      if (elapsed > timeout) {
        clearInterval(checkInterval);
        console.error('✗ Timeout waiting for image page load');
        reject(new Error('Timeout waiting for image page to load'));
        return;
      }

      // Check if URL matches the pattern /imagine/post/{UUID}
      const urlPattern = /https:\/\/grok\.com\/imagine\/post\/[a-f0-9-]{36}/;
      if (urlPattern.test(currentUrl)) {
        clearInterval(checkInterval);
        console.log('✓ URL updated to:', currentUrl);
        resolve(currentUrl);
        return;
      }

      // Log progress every 5 seconds
      if (elapsed % 5000 < 100) {
        console.log(`Still waiting for URL update... (${Math.floor(elapsed / 1000)}s)`);
      }

    }, 100); // Check every 100ms
  });
}

// Find "Make a video" textarea on image page
async function findMakeVideoTextarea(maxAttempts = 30) {
  console.log('Searching for "Make a video" textarea...');
  await waitForDocumentComplete();

  for (let i = 0; i < maxAttempts; i++) {
    console.log(`Attempt ${i + 1}/${maxAttempts}...`);

    // Specific selectors for "Make a video" textarea
    const selectors = [
      'textarea[aria-label="Make a video"]',  // Most specific
      'textarea[placeholder*="customize"]',
      'textarea[placeholder*="video"]',
      'textarea[aria-required="true"]',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) {
        console.log('✓ Found "Make a video" textarea with selector:', selector);
        console.log('  Tag:', element.tagName);
        console.log('  Aria-label:', element.getAttribute('aria-label'));
        console.log('  Placeholder:', element.placeholder);
        return element;
      }
    }

    await sleep(1000);
  }

  console.error('✗ "Make a video" textarea not found after', maxAttempts, 'attempts');
  return null;
}

// Update status (send to background)
function updateStatus(status) {
  console.log('Status:', status);
  chrome.runtime.sendMessage({
    type: 'UPDATE_STATUS',
    status: status
  });
}

// Placeholder chat/vision job flow.
// This should be replaced with real Grok chat automation once selectors are finalized.
async function processChatJob(job) {
  console.log('=== Starting chat job processing (placeholder) ===');
  console.log('Job ID:', job.job_id);
  console.log('Chat request payload:', job.request);
  console.log('Received job.chatConfig:', job.chatConfig || null);
  const chatTiming = getChatTimingConfig(job);
  console.log('Resolved chat timing config:', chatTiming);

  try {
    updateStatus('Initializing chat...');
    await sleep(500);

    updateStatus('Navigating to grok.com...');
    await ensureOnGrokChatHome();
    await waitForDocumentComplete();

    updateStatus('Waiting for attach button...');
    const attachButton = await findAttachButton(30);
    if (!attachButton) {
      throw new Error('Attach button not found on https://grok.com/');
    }
    console.log('✓ Attach button detected on chat page');

    const { images, contextText } = await extractChatInputsFromRequest(job.request);
    console.log(`Extracted ${images.length} image(s) from request`);
    console.log('Context text length:', contextText.length);

    if (images.length > 0) {
      updateStatus(`Uploading ${images.length} image(s)...`);
      for (let i = 0; i < images.length; i++) {
        console.log(`Uploading image ${i + 1}/${images.length}...`);
        await uploadImageToGrok(images[i]);
        // Wait for image to upload and page to update before next upload
        await sleep(chatTiming.imageUploadDelayMs);
      }
      console.log('✓ All request images uploaded');
    }

    if (contextText) {
      updateStatus('Entering context text...');
      await waitForDocumentComplete();
      const contextInput = await findChatContextInput();
      if (!contextInput) {
        throw new Error('Chat context input not found');
      }
      await insertTextFast(contextInput, contextText);
      console.log('✓ Context text entered');
    }

    updateStatus('Submitting chat request...');
    await waitForDocumentComplete();
    const submitButton = await findChatSubmitButton();
    if (!submitButton) {
      throw new Error('Chat submit button not found');
    }
    await simulateClick(submitButton);
    console.log('✓ Chat submit button clicked');
    await sleep(1200);

    updateStatus('Waiting for model response to finish...');
    await waitForDocumentComplete();
    const modelFinished = await waitForStopModelResponseInactive();
    if (!modelFinished) {
      throw new Error('Model response did not finish in time');
    }
    await sleep(1000);

    updateStatus('Waiting for response...');
    await waitForDocumentComplete();
    const responseText = await waitForChatResponseMarkdownText();
    if (!responseText || responseText.trim().length === 0) {
      throw new Error('Response markdown text is empty');
    }
    await waitForDocumentComplete();

    updateStatus('Extracting response text...');
    console.log('✓ Extracted response raw length:', responseText.length);
    console.log('✓ Extracted response trimmed length:', responseText.trim().length);
    
    chrome.runtime.sendMessage({
      type: 'JOB_CHAT_COMPLETED',
      jobId: job.job_id,
      content: responseText
    });

    updateStatus('Completed!');
    await sleep(300);
    console.log('=== Chat job completed ===');
    refreshGrokChatHomeIfNeeded();
  } catch (error) {
    console.error('=== Chat job processing failed ===', error);
    chrome.runtime.sendMessage({
      type: 'JOB_FAILED',
      jobId: job.job_id,
      error: `Chat processing failed: ${error.message}`
    });
  }
}

async function ensureOnGrokChatHome() {
  const targetUrl = 'https://grok.com/';
  const currentUrl = window.location.href;

  if (currentUrl === targetUrl || currentUrl === 'https://grok.com') {
    console.log('✓ Already on grok.com home');
    return;
  }
  throw new Error(`Not on ${targetUrl}. Current URL: ${currentUrl}`);
}

async function extractChatInputsFromRequest(request) {
  const result = {
    images: [],
    contextText: ''
  };

  if (!request || !Array.isArray(request.messages)) {
    return result;
  }

  const textParts = [];
  const imageEntries = [];

  for (const message of request.messages) {
    if (!message || message.role !== 'user') {
      continue;
    }

    const content = message.content;
    if (typeof content === 'string') {
      if (content.trim()) textParts.push(content.trim());
      continue;
    }

    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== 'object') {
        continue;
      }

      if (part.type === 'text' && part.text) {
        textParts.push(String(part.text).trim());
      }

      if (part.type === 'image_url') {
        if (typeof part.image_url === 'string') {
          imageEntries.push(part.image_url);
        } else if (part.image_url && typeof part.image_url.url === 'string') {
          imageEntries.push(part.image_url.url);
        }
      }

      if (part.type === 'input_image' && part.image_url && typeof part.image_url === 'string') {
        imageEntries.push(part.image_url);
      }
    }
  }

  const uniqueImages = [...new Set(imageEntries.filter(Boolean))];
  for (const imageUrl of uniqueImages) {
    const dataUrl = await imageUrlToDataUrl(imageUrl);
    result.images.push(dataUrl);
  }

  result.contextText = textParts.filter(Boolean).join('\n\n').trim();
  return result;
}

async function imageUrlToDataUrl(imageUrl) {
  if (imageUrl.startsWith('data:image/')) {
    return imageUrl;
  }

  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    throw new Error(`Unsupported image URL format: ${imageUrl.substring(0, 60)}`);
  }

  const response = await fetch(imageUrl, {
    method: 'GET',
    credentials: 'include',
    mode: 'cors'
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image URL: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();
  return await blobToDataUrl(blob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const value = reader.result;
      if (typeof value === 'string') {
        resolve(value);
      } else {
        reject(new Error('Failed to convert blob to data URL'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read blob as data URL'));
    reader.readAsDataURL(blob);
  });
}

async function findChatContextInput(maxAttempts = 30) {
  console.log('Searching for chat context input...');
  await waitForDocumentComplete();

  for (let i = 0; i < maxAttempts; i++) {
    const selectors = [
      'div.tiptap.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"] .is-editor-empty[data-placeholder*="What do you want to know"]',
      'div[contenteditable="true"][tabindex="0"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) {
        continue;
      }

      const target = element.closest('div[contenteditable="true"]') || element;
      if (target && target.offsetParent !== null) {
        console.log('✓ Found chat input with selector:', selector);
        return target;
      }
    }

    await sleep(500);
  }

  return null;
}

async function findChatSubmitButton(maxAttempts = 30) {
  console.log('Searching for chat submit button...');
  await waitForDocumentComplete();

  for (let i = 0; i < maxAttempts; i++) {
    const selectors = [
      'button[type="submit"][aria-label="Submit"]',
      'button[aria-label="Submit"]',
      'button[type="submit"]'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (element.offsetParent !== null && !element.disabled) {
          console.log('✓ Found chat submit button with selector:', selector);
          return element;
        }
      }
    }

    await sleep(300);
  }

  return null;
}

async function waitForChatResponseMarkdownText(maxAttempts = 120) {
  console.log('Waiting for response-content-markdown text...');
  await waitForDocumentComplete();

  for (let i = 0; i < maxAttempts; i++) {
    const text = extractLatestChatResponseMarkdownText();
    if (text && text.trim().length > 0) {
      console.log('✓ Found non-empty response-content-markdown text');
      return text;
    }

    await sleep(500);
  }

  return '';
}

async function waitForStopModelResponseInactive(maxAttempts = 240) {
  console.log('Waiting for "Stop model response" button to become inactive...');
  await waitForDocumentComplete();

  for (let i = 0; i < maxAttempts; i++) {
    const stopButtons = Array.from(document.querySelectorAll('button[aria-label="Stop model response"]'));
    const activeStopButton = stopButtons.find(btn => btn.offsetParent !== null && !btn.disabled);

    if (!activeStopButton) {
      console.log('✓ Stop model response button is not active');
      return true;
    }

    await sleep(500);
  }

  return false;
}

function extractLatestChatResponseMarkdownText() {
  const containers = Array.from(document.querySelectorAll('div.response-content-markdown.markdown'));
  const visibleContainers = containers.filter(el => el.offsetParent !== null);
  const candidates = visibleContainers.length > 0 ? visibleContainers : containers;

  if (candidates.length === 0) {
    return '';
  }

  const last = candidates[candidates.length - 1];
  const text = (last.innerText || last.textContent || '').trim();
  return text;
}

function refreshGrokChatHomeIfNeeded() {
  const targetUrl = 'https://grok.com/';
  const currentUrl = window.location.href;

  if (currentUrl !== targetUrl && currentUrl !== 'https://grok.com') {
    window.location.href = targetUrl;
  } else {
    console.log('Already on grok.com home page, skipping refresh navigation');
  }
}

async function waitForDocumentComplete(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (document.readyState === 'complete') {
      return true;
    }
    await sleep(200);
  }

  console.warn(`Document did not reach readyState=complete within ${timeoutMs}ms, continuing anyway.`);
  return false;
}

async function getChatTimingConfig(job) {
  const chatConfig = job?.chatConfig || {};
  const imageUploadDelayMs = Number(chatConfig.imageUploadDelayMs || 5000);

  return {
    imageUploadDelayMs: Number.isFinite(imageUploadDelayMs) && imageUploadDelayMs >= 0 ? imageUploadDelayMs : 5000
  };
}

// Prepare page state for next job
async function prepareVideoForNextUse() {
  const targetUrl = 'https://grok.com/imagine';
  const currentUrl = window.location.href;

  console.log('Preparing for next use...');
  console.log('Current URL before cleanup:', currentUrl);
  updateStatus('Preparing for next job...');

  if (currentUrl === targetUrl || currentUrl === `${targetUrl}/`) {
    console.log('✓ Already on main imagine page');
    return;
  }

  try {
    // First try UI navigation (faster and less disruptive than full reload).
    await navigateToVideoImaginePage();
  } catch (error) {
    console.warn('UI navigation to imagine page failed, using direct URL navigation:', error.message);
  }

  const finalUrl = window.location.href;
  if (finalUrl !== targetUrl && finalUrl !== `${targetUrl}/`) {
    console.log('Navigating directly to main imagine page:', targetUrl);
    window.location.href = targetUrl;
  } else {
    console.log('✓ Prepared for next job on main imagine page');
  }
}

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
