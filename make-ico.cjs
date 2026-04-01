const fs = require('fs');

// Minimal valid 16x16 ICO file (1-bit black image)
const icoData = Buffer.from([
  // ICO header
  0x00, 0x00, // Reserved
  0x01, 0x00, // Type (1 = ICO)
  0x01, 0x00, // Number of images

  // Image directory entry
  0x10, // Width (16px)
  0x10, // Height (16px)
  0x00, // Number of colors (0 = no palette)
  0x00, // Reserved
  0x01, 0x00, // Color planes
  0x20, 0x00, // Bits per pixel (32)
  0x00, 0x04, 0x00, 0x00, // Size of image data
  0x16, 0x00, 0x00, 0x00, // Offset to image data

  // BMP header
  0x28, 0x00, 0x00, 0x00, // Header size
  0x10, 0x00, 0x00, 0x00, // Width
  0x20, 0x00, 0x00, 0x00, // Height (doubled for ICO)
  0x01, 0x00, // Planes
  0x20, 0x00, // Bits per pixel
  0x00, 0x00, 0x00, 0x00, // Compression
  0x00, 0x04, 0x00, 0x00, // Image size
  0x00, 0x00, 0x00, 0x00, // X pixels per meter
  0x00, 0x00, 0x00, 0x00, // Y pixels per meter
  0x00, 0x00, 0x00, 0x00, // Colors used
  0x00, 0x00, 0x00, 0x00, // Important colors

  // Pixel data (16x16 pixels, BGRA format, teal color)
  ...Buffer.alloc(16 * 16 * 4).fill(0).map((_, i) => {
    const channel = i % 4;
    if (channel === 0) return 0xA6; // B
    if (channel === 1) return 0xB8; // G
    if (channel === 2) return 0x14; // R
    return 0xFF; // A
  }),
]);

fs.writeFileSync('src-tauri/icons/icon.ico', icoData);
console.log('Created icon.ico');
