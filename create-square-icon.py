#!/usr/bin/env python3
from PIL import Image

# Load the image
img = Image.open('bitgit-icon.png')
print(f"Original size: {img.size}")

# Get the maximum dimension
max_dim = max(img.size)

# Create a new square image with transparent background
square_img = Image.new('RGBA', (max_dim, max_dim), (0, 0, 0, 0))

# Calculate position to center the original image
x = (max_dim - img.width) // 2
y = (max_dim - img.height) // 2

# Paste the original image onto the square canvas
square_img.paste(img, (x, y), img if img.mode == 'RGBA' else None)

# Save the square image
square_img.save('bitgit-icon-square.png')
print(f"Created square icon: {max_dim}x{max_dim}")
print("Saved as: bitgit-icon-square.png")
