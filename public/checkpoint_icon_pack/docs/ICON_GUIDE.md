# Checkpoint Icon Pack — Style & Usage Guide

Bộ icon này được thiết kế cho app **Checkpoint** theo hướng **playful travel journal / cartoon sketch**: thân thiện, có cảm giác vẽ tay nhẹ, nhưng vẫn đủ sạch để dùng trong product UI.

## 1. Tinh thần thiết kế

- **Không glossy, không gradient AI**, không glassmorphism.
- Icon dùng nét bo tròn, dày vừa, giống doodle/sketch nhưng vẫn rõ nghĩa.
- Ưu tiên cảm giác: **du lịch, cắm cờ, khám phá, nhật ký hành trình, sticker, passport stamp**.
- Icon nên hỗ trợ UI chứ không lấn át nội dung.

## 2. Token chính

| Token | Giá trị | Dùng cho |
|---|---:|---|
| Primary Orange | `#F05A28` | active tab, CTA, icon chính |
| Ink | `#2A211C` | icon mặc định, text chính |
| Muted | `#7A6B5F` | icon phụ, metadata |
| Paper | `#FFFDF8` | nền card |
| Warm Cream | `#FFF8F1` | nền app |
| Success Green | `#2F8A52` | trạng thái đã cắm, success |
| Mustard | `#E0A73A` | rating star, achievement |
| Soft Olive | `#8CA96B` | tag nature, travel/passport |

File token nằm ở:

```txt
/tokens/checkpoint-icon-tokens.json
/tokens/checkpoint-icon.css
```

## 3. Quy chuẩn SVG

- Canvas: `24x24`
- Stroke width: `2.2`
- Stroke linecap: `round`
- Stroke linejoin: `round`
- Fill mặc định: `none`
- Màu mặc định: `currentColor`

Điều này giúp đổi màu icon bằng CSS:

```html
<img src="icons/flag.svg" class="icon" />
```

Với inline SVG hoặc React component:

```tsx
<FlagIcon className="cp-icon cp-icon--primary" />
```

## 4. Kích thước đề xuất

| Context | Size |
|---|---:|
| Metadata trong card | 16–18px |
| Bottom navigation | 24px |
| Button icon | 20–24px |
| Badge / empty state | 32–48px |
| Illustration accent | 64px+ |

## 5. Cách dùng màu

### Default icon
Dùng `Ink` cho icon chính trong UI bình thường.

```css
.icon-default { color: #2A211C; }
```

### Active / primary
Dùng `Primary Orange` cho active tab, CTA, hành động cắm cờ.

```css
.icon-primary { color: #F05A28; }
```

### Success / checked-in
Dùng `Success Green` cho trạng thái đã cắm.

```css
.icon-success { color: #2F8A52; }
```

### Rating / achievement
Dùng `Mustard` cho sao rating, huy hiệu, thành tích.

```css
.icon-rating { color: #E0A73A; }
```

## 6. Mapping icon theo màn

### Discover
- `pin.svg`: vị trí hiện tại, địa chỉ.
- `search.svg`: search bar.
- `filter.svg`: filter button.
- `flag.svg`: số cờ / check-in count.
- `camera.svg` hoặc `image.svg`: số ảnh.
- `star.svg`: rating.
- `coffee.svg`, `food.svg`, `mountain.svg`: category.
- `check.svg`: đã cắm.

### Detail
- `flag-planted.svg`: CTA cắm cờ tại đây.
- `route.svg`: chỉ đường.
- `bookmark.svg`: lưu.
- `share.svg`: chia sẻ.
- `heart.svg`: yêu thích.
- `xp-coin.svg`: XP nhận được.

### Create Check-in
- `pin.svg`: bước chọn địa điểm.
- `camera.svg`: thêm ảnh.
- `star.svg`: đánh giá.
- `friends.svg`: gắn bạn bè.
- `check.svg`: hoàn tất.
- `xp-coin.svg`: reward card.

### Profile
- `profile.svg`: hồ sơ.
- `badge.svg`: huy hiệu.
- `passport.svg`: hộ chiếu.
- `medal.svg`: level / achievement.
- `calendar.svg`: ngày tham gia.
- `settings.svg`: cài đặt.
- `logout.svg`: đăng xuất.

### Leaderboard
- `trophy.svg`: bảng xếp hạng.
- `medal.svg`: top rank.
- `xp-coin.svg`: điểm XP.
- `flag.svg`: số lần cắm cờ.

## 7. Button examples

```tsx
<button className="btn btn-primary">
  <FlagIcon className="cp-icon cp-icon--sm" />
  Cắm cờ
</button>

<button className="btn btn-secondary">
  <RouteIcon className="cp-icon cp-icon--sm" />
  Chỉ đường
</button>
```

## 8. CSS base

Import file:

```ts
import './tokens/checkpoint-icon.css';
```

Dùng class:

```html
<svg class="cp-icon cp-icon--primary">...</svg>
```

Hoặc nếu dùng `<img>`, màu trong SVG sẽ không đổi bằng `currentColor`. Với React, tốt nhất import SVG thành component bằng SVGR.

## 9. Không nên làm

- Không dùng icon quá mảnh dưới `1.5px`.
- Không pha nhiều màu trong một icon nhỏ 16–24px.
- Không dùng gradient cho icon UI.
- Không trộn icon Material/Lucide mặc định với bộ này nếu chưa chỉnh stroke/radius cho đồng bộ.
- Không dùng icon sketch quá méo ở button quan trọng.

## 10. Checklist khi thêm icon mới

- Canvas 24x24.
- Stroke `2.2`.
- Round cap/join.
- Dùng `currentColor`.
- Có tên file kebab-case, ví dụ `place-hot.svg`.
- Test ở 16px, 24px, 32px.
- Test trên nền `#FFF8F1` và card `#FFFDF8`.
