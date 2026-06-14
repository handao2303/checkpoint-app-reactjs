// Canvas2D share-card renderer. We draw the card on a <canvas> instead of using
// html-to-image because WebKit (every browser/PWA on iOS) renders <img> inside
// the SVG <foreignObject> that html-to-image relies on as BLANK — so photos
// vanished on iPhone. Canvas2D drawImage works everywhere.

import QRCode from "qrcode";
import { categoryIcon } from "./maps";

const W = 540;
const PAD = 32;
const GAP = 20;
const SCALE = 2; // retina output

const PRIMARY: [string, string] = ["#FF8A3D", "#F4511E"];
const PASSPORT: [string, string] = ["#C2410C", "#9A3412"];

const font = (weight: number, size: number) =>
  `${weight} ${size}px Montserrat, system-ui, -apple-system, sans-serif`;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    // Distinct query so we never reuse a non-CORS <img> copy the page cached.
    img.src = url + (url.includes("?") ? "&" : "?") + "cors=1";
  });
}

async function loadImages(urls: string[]): Promise<HTMLImageElement[]> {
  const imgs = await Promise.all(urls.map(loadImage));
  return imgs.filter((i): i is HTMLImageElement => i !== null);
}

async function generateQR(url: string): Promise<HTMLCanvasElement | null> {
  try {
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, url, {
      width: 72,
      margin: 1,
      color: { dark: "#1a1a1a", light: "#ffffff" },
    });
    return canvas;
  } catch {
    return null;
  }
}

async function ensureFonts() {
  try {
    await Promise.all([
      document.fonts.load(font(800, 34)),
      document.fonts.load(font(700, 18)),
      document.fonts.load(font(600, 14)),
      document.fonts.load(font(500, 16)),
    ]);
    await document.fonts.ready;
  } catch {
    /* fall back to system font */
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const ar = img.width / img.height;
  const tar = w / h;
  let sw: number, sh: number, sx: number, sy: number;
  if (ar > tar) {
    sh = img.height;
    sw = sh * tar;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / tar;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

// ---- Block model: each block measures then draws, stacked vertically ----

interface Block {
  measure(ctx: CanvasRenderingContext2D, w: number): number;
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void;
}

function photos(imgs: HTMLImageElement[]): Block | null {
  const list = imgs.slice(0, 3);
  if (list.length === 0) return null;
  return {
    measure: () => (list.length === 1 ? 240 : list.length === 2 ? 180 : 176 + 6 + 140),
    draw(ctx, x, y, w) {
      const g = 6;
      if (list.length === 1) {
        drawCover(ctx, list[0], x, y, w, 240, 16);
      } else if (list.length === 2) {
        const cw = (w - g) / 2;
        drawCover(ctx, list[0], x, y, cw, 180, 16);
        drawCover(ctx, list[1], x + cw + g, y, cw, 180, 16);
      } else {
        drawCover(ctx, list[0], x, y, w, 176, 16);
        const cw = (w - g) / 2;
        drawCover(ctx, list[1], x, y + 176 + g, cw, 140, 16);
        drawCover(ctx, list[2], x + cw + g, y + 176 + g, cw, 140, 16);
      }
    },
  };
}

function header(opts: { emoji?: string; initial?: string; title: string; subtitle?: string; badge?: string }): Block {
  const ICON = 64;
  const gap = 16;
  return {
    measure(ctx, w) {
      ctx.font = font(800, 30);
      const titleW = w - ICON - gap - (opts.badge ? 60 : 0);
      const lines = wrap(ctx, opts.title, titleW);
      const textH = lines.length * 36 + (opts.subtitle ? 24 : 0);
      return Math.max(ICON, textH);
    },
    draw(ctx, x, y, w) {
      // icon / initial
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      roundRect(ctx, x, y, ICON, ICON, opts.initial ? ICON / 2 : 18);
      ctx.fill();
      ctx.fillStyle = "#fff";
      if (opts.initial) {
        ctx.textAlign = "center";
        ctx.font = font(700, 34);
        ctx.fillText(opts.initial, x + ICON / 2, y + ICON / 2 + 12);
        ctx.textAlign = "left";
      } else if (opts.emoji) {
        ctx.save();
        ctx.font = '40px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(opts.emoji, x + ICON / 2, y + ICON / 2);
        ctx.restore();
      }

      const tx = x + ICON + gap;
      const titleW = w - ICON - gap - (opts.badge ? 60 : 0);
      ctx.font = font(800, 30);
      ctx.fillStyle = "#fff";
      const lines = wrap(ctx, opts.title, titleW);
      let ty = y + 2;
      for (const line of lines) {
        ctx.fillText(line, tx, ty);
        ty += 36;
      }
      if (opts.subtitle) {
        ctx.font = font(500, 14);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillText(opts.subtitle, tx, ty + 2);
      }
      if (opts.badge) {
        ctx.font = font(700, 16);
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        const bw = ctx.measureText(opts.badge).width + 24;
        roundRect(ctx, x + w - bw, y + 6, bw, 32, 16);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.fillText(opts.badge, x + w - bw / 2, y + 14);
        ctx.textAlign = "left";
      }
    },
  };
}

function quote(text: string): Block {
  return {
    measure(ctx, w) {
      ctx.font = font(500, 18);
      return wrap(ctx, `“${text}”`, w).length * 26;
    },
    draw(ctx, x, y, w) {
      ctx.font = font(500, 18);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      let ty = y;
      for (const line of wrap(ctx, `“${text}”`, w)) {
        ctx.fillText(line, x, ty);
        ty += 26;
      }
    },
  };
}

function stats(items: { label: string; value: string }[]): Block {
  const H = 64;
  return {
    measure: () => H,
    draw(ctx, x, y, w) {
      const g = 12;
      const bw = (w - g * (items.length - 1)) / items.length;
      items.forEach((it, i) => {
        const bx = x + i * (bw + g);
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        roundRect(ctx, bx, y, bw, H, 12);
        ctx.fill();
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";
        ctx.font = font(700, 24);
        ctx.fillText(it.value, bx + bw / 2, y + 12);
        ctx.font = font(500, 12);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(it.label, bx + bw / 2, y + 42);
        ctx.textAlign = "left";
      });
    },
  };
}

function footer(opts: { left?: string; center?: string; right?: string }): Block {
  return {
    measure: () => 56,
    draw(ctx, x, y, w) {
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
      const cy = y + 30;
      if (opts.left) {
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.font = font(700, 14);
        const lw = ctx.measureText(opts.left).width + 24;
        roundRect(ctx, x, cy - 10, lw, 28, 14);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.fillText(opts.left, x + lw / 2, cy - 3);
      }
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = font(500, 14);
      if (opts.center) {
        ctx.textAlign = "center";
        ctx.fillText(opts.center, x + w / 2, cy - 3);
      }
      if (opts.right) {
        ctx.textAlign = "right";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText(opts.right, x + w, cy - 3);
      }
      ctx.textAlign = "left";
    },
  };
}

function centerText(text: string): Block {
  return {
    measure(ctx) {
      ctx.font = font(500, 14);
      return 44;
    },
    draw(ctx, x, y, w) {
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
      ctx.font = font(500, 14);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.textAlign = "center";
      ctx.fillText(text, x + w / 2, y + 18);
      ctx.textAlign = "left";
    },
  };
}

const QR_SIZE = 72;
const QR_ROW_H = QR_SIZE + 24; // 12px top margin + 12px bottom margin

async function render(gradient: [string, string], blocks: (Block | null)[], qrUrl?: string): Promise<Blob | null> {
  await ensureFonts();

  const qrImg = qrUrl ? await generateQR(qrUrl) : null;

  const list = blocks.filter((b): b is Block => b !== null);
  const contentW = W - PAD * 2;

  // Measure pass on a throwaway context.
  const measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return null;
  const wordmarkH = 36;
  const heights = list.map((b) => b.measure(measureCtx, contentW));
  const total =
    PAD + wordmarkH + GAP +
    heights.reduce((a, h) => a + h, 0) +
    GAP * list.length +
    (qrImg ? QR_ROW_H : 0) +
    PAD;

  // Real canvas.
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = Math.round(total) * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "top";

  // Background gradient (diagonal).
  const g = ctx.createLinearGradient(0, 0, W, total);
  g.addColorStop(0, gradient[0]);
  g.addColorStop(1, gradient[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, total);

  // Wordmark: pin + "Checkpoint".
  const pin = await loadImage("/pin.svg").catch(() => null);
  let wx = PAD;
  if (pin) {
    ctx.drawImage(pin, PAD, PAD, 30, 30);
    wx = PAD + 38;
  }
  ctx.fillStyle = "#fff";
  ctx.font = font(800, 26);
  ctx.fillText("Checkpoint", wx, PAD + 2);

  // Blocks.
  let y = PAD + wordmarkH + GAP;
  list.forEach((b, i) => {
    b.draw(ctx, PAD, y, contentW);
    y += heights[i] + GAP;
  });

  // QR row at the bottom.
  if (qrImg) {
    // Divider line.
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();

    const rowY = y + 12;
    const qrX = W - PAD - QR_SIZE;

    // White rounded bg for QR.
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    roundRect(ctx, qrX - 5, rowY - 5, QR_SIZE + 10, QR_SIZE + 10, 10);
    ctx.fill();
    ctx.drawImage(qrImg, qrX, rowY, QR_SIZE, QR_SIZE);

    // "Quét để xem" label on the left.
    ctx.font = font(600, 14);
    ctx.fillStyle = "#fff";
    ctx.fillText("Quét để xem", PAD, rowY + QR_SIZE / 2 - 18);
    ctx.font = font(500, 13);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText("trên Checkpoint", PAD, rowY + QR_SIZE / 2 + 2);
  }

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

// ---- Public renderers ----

export function renderCheckpointCard(data: {
  name: string;
  category: string;
  note?: string | null;
  address?: string | null;
  xp: number;
  author: string;
  date: string;
  imageUrls?: string[];
  url?: string;
}): Promise<Blob | null> {
  const images = [data.imageUrls?.[0]].filter((u): u is string => !!u);
  return loadImages(images).then((imgs) =>
    render(
      PRIMARY,
      [
        photos(imgs),
        header({ emoji: categoryIcon(data.category), title: data.name, subtitle: data.address ? `📍 ${data.address}` : undefined }),
        data.note ? quote(data.note) : null,
        footer({ left: `+${data.xp} XP`, center: `bởi ${data.author}`, right: data.date }),
      ],
      data.url,
    ),
  );
}

export function renderJourneyCard(data: {
  title: string;
  count: number;
  xp: number;
  distanceKm: number;
  date: string;
  imageUrls?: string[];
  url?: string;
}): Promise<Blob | null> {
  return loadImages(data.imageUrls ?? []).then((imgs) =>
    render(
      PASSPORT,
      [
        photos(imgs),
        header({ emoji: "🧳", title: data.title, subtitle: "Hành trình" }),
        stats([
          { label: "Check-in", value: String(data.count) },
          { label: "XP", value: String(data.xp) },
          { label: "Km", value: data.distanceKm.toFixed(1) },
        ]),
        footer({ right: data.date }),
      ],
      data.url,
    ),
  );
}

export function renderProfileCard(data: {
  name: string;
  username: string;
  level: number;
  totalXp: number;
  checkpointCount: number;
  journeyCount: number;
  url?: string;
}): Promise<Blob | null> {
  return render(
    PASSPORT,
    [
      header({ initial: (data.name[0] ?? "?").toUpperCase(), title: data.name, subtitle: `@${data.username}`, badge: `Lv ${data.level}` }),
      stats([
        { label: "Tổng XP", value: data.totalXp.toLocaleString() },
        { label: "Số cờ", value: String(data.checkpointCount) },
        { label: "Hành trình", value: String(data.journeyCount) },
      ]),
      centerText("Hộ chiếu du lịch của tôi 🛂"),
    ],
    data.url,
  );
}
