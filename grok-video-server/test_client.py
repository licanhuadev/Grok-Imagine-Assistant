#!/usr/bin/env python3
"""
Simple test client for the Grok Imagine API
"""

import requests
import time
import sys


def test_api(server_url='http://localhost:8000'):
    """Test the video generation API"""

    print(f"Testing Grok Imagine API at {server_url}\n")

    # 1. Health check
    print("1. Testing health check...")
    try:
        response = requests.get(f"{server_url}/health")
        if response.ok:
            print("   ✓ Server is running")
            print(f"   Response: {response.json()}\n")
        else:
            print(f"   ✗ Server error: {response.status_code}")
            return
    except Exception as e:
        print(f"   ✗ Cannot connect to server: {e}")
        print(f"   Make sure the server is running at {server_url}")
        return

    # 2. Create video generation job
    print("2. Creating video generation job...")
    prompt = "A serene lake at sunset with mountains reflecting in the water"

    try:
        response = requests.post(
            f"{server_url}/v1/videos/generations",
            json={
                "model": "grok",
                "prompt": prompt
            }
        )

        if not response.ok:
            print(f"   ✗ Failed to create job: {response.status_code}")
            print(f"   Response: {response.text}")
            return

        job = response.json()
        job_id = job['id']

        print(f"   ✓ Job created successfully")
        print(f"   Job ID: {job_id}")
        print(f"   Status: {job['status']}")
        print(f"   Video URL: {job['video_url']}\n")

    except Exception as e:
        print(f"   ✗ Error creating job: {e}")
        return

    # 3. Poll for job completion
    print("3. Polling for job completion...")
    print("   (This requires the Chrome extension to be running)")
    print("   Waiting for video generation...\n")

    max_wait = 180  # 3 minutes
    start_time = time.time()
    last_status = None

    while time.time() - start_time < max_wait:
        try:
            response = requests.get(f"{server_url}/v1/videos/generations/{job_id}")

            if not response.ok:
                print(f"   ✗ Failed to get job status: {response.status_code}")
                break

            job = response.json()
            status = job['status']

            # Only print if status changed
            if status != last_status:
                elapsed = int(time.time() - start_time)
                print(f"   [{elapsed}s] Status: {status}")
                last_status = status

            if status == 'completed':
                print(f"\n   ✓ Video generation completed!")
                print(f"   Video URL: {job['video_url']}")
                print(f"   Total time: {elapsed} seconds\n")

                # 4. Test video download
                print("4. Testing video download...")
                try:
                    video_response = requests.get(job['video_url'])
                    if video_response.ok:
                        filename = f"{job_id}.mp4"
                        with open(filename, 'wb') as f:
                            f.write(video_response.content)

                        video_size = len(video_response.content)
                        print(f"   ✓ Video downloaded successfully")
                        print(f"   Saved to: {filename}")
                        print(f"   Size: {video_size:,} bytes ({video_size / 1024 / 1024:.2f} MB)\n")
                    else:
                        print(f"   ✗ Failed to download video: {video_response.status_code}")
                except Exception as e:
                    print(f"   ✗ Error downloading video: {e}")

                print("✓ All tests passed!\n")
                return

            elif status == 'failed':
                print(f"\n   ✗ Job failed: {job.get('error', 'Unknown error')}\n")
                return

            time.sleep(5)

        except Exception as e:
            print(f"   ✗ Error polling job: {e}")
            break

    print(f"\n   ✗ Timeout waiting for job completion (waited {max_wait}s)")
    print("   Possible issues:")
    print("   - Chrome extension is not running")
    print("   - No Grok tab is open in Chrome")
    print("   - Extension cannot connect to server")
    print("   - Grok rate limiting\n")


if __name__ == '__main__':
    # Get server URL from command line or use default
    server_url = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000'

    try:
        test_api(server_url)
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
        sys.exit(0)
