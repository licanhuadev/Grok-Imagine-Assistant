# Extension Icons

Please create the following icon files for the extension:

- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels
- `icon128.png` - 128x128 pixels

You can:
1. Create simple colored squares with your preferred design tool
2. Use an online icon generator
3. Use the following Python script if you have PIL installed:

```python
from PIL import Image, ImageDraw

def create_icon(size, filename):
    img = Image.new('RGB', (size, size), color='#667eea')
    draw = ImageDraw.Draw(img)

    # Draw a simple video camera icon
    margin = size // 4
    draw.rectangle([margin, margin, size - margin, size - margin], fill='white')
    draw.ellipse([size // 3, size // 3, 2 * size // 3, 2 * size // 3], fill='#667eea')

    img.save(filename)

create_icon(16, 'icon16.png')
create_icon(48, 'icon48.png')
create_icon(128, 'icon128.png')
```

For now, you can test the extension without icons, but Chrome will show a default icon.
