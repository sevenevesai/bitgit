const fs = require('fs');
const { execSync } = require('child_process');

// Use ImageMagick or a Node package to create a square version
// For now, let's use a simple approach with canvas
const { createCanvas, loadImage } = require('canvas');

async function makeSquareIcon() {
  try {
    const image = await loadImage('bitgit-icon.png');
    const size = Math.max(image.width, image.height);

    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Fill with transparent background
    ctx.clearRect(0, 0, size, size);

    // Center the image
    const x = (size - image.width) / 2;
    const y = (size - image.height) / 2;
    ctx.drawImage(image, x, y);

    // Save
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync('bitgit-icon-square.png', buffer);
    console.log(`Created square icon: ${size}x${size}`);
  } catch (err) {
    console.error('Error:', err.message);
    console.log('\nTrying alternative method with ImageMagick...');
    try {
      // Try using ImageMagick if available
      execSync('magick bitgit-icon.png -gravity center -background none -extent 1024x1024 bitgit-icon-square.png', { stdio: 'inherit' });
    } catch (e) {
      console.error('ImageMagick not available. Please install canvas: npm install canvas');
    }
  }
}

makeSquareIcon();
