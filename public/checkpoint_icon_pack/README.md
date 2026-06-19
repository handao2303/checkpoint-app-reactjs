# Checkpoint Icon Pack

Export gồm:

```txt
icons/                  SVG dùng currentColor
icons-primary/          SVG fixed màu brand orange #F05A28
tokens/                 CSS variables + JSON token
docs/ICON_GUIDE.md      Style guide & usage guide
preview.html            Xem nhanh toàn bộ icon
```

## Dùng nhanh

```html
<svg class="cp-icon cp-icon--primary">...</svg>
```

Hoặc import SVG thành React component bằng SVGR:

```tsx
import FlagIcon from './icons/flag.svg?react';

export function CheckInButton() {
  return <button><FlagIcon className="cp-icon cp-icon--primary" /> Cắm cờ</button>;
}
```

## Style

Playful travel journal / cartoon sketch, dùng cho app Checkpoint.
