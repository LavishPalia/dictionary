import * as THREE from 'three';
import { BookPage } from './types';

const CANVAS_WIDTH = 1120;
const CANVAS_HEIGHT = 1280;

/**
 * High-resolution canvas texture baker with LRU cache & texture disposal
 */
class PageTextureManager {
  private textureCache = new Map<number, THREE.CanvasTexture>();
  private accessOrder: number[] = [];
  // Expanded to 8 to comfortably accommodate cascading multi-page riffles without thrashing
  private readonly MAX_ACTIVE_TEXTURES = 8;

  /**
   * Ensure web fonts are completely loaded before rasterizing to canvas
   */
  public async ensureFontsLoaded(): Promise<void> {
    if (typeof document !== 'undefined' && document.fonts) {
      await document.fonts.ready;
    }
  }

  /**
   * Get or bake a Three.js CanvasTexture for a BookPage
   */
  public getOrCreateTexture(page: BookPage | null, isLeftPage: boolean, highlightedWord?: string): THREE.CanvasTexture {
    const pageNum = page ? page.page_number : isLeftPage ? -1 : -2;

    if (this.textureCache.has(pageNum)) {
      this.accessOrder = this.accessOrder.filter(n => n !== pageNum);
      this.accessOrder.push(pageNum);
      return this.textureCache.get(pageNum)!;
    }

    if (this.accessOrder.length >= this.MAX_ACTIVE_TEXTURES) {
      const oldestNum = this.accessOrder.shift();
      if (oldestNum !== undefined && this.textureCache.has(oldestNum)) {
        const oldTex = this.textureCache.get(oldestNum);
        oldTex?.dispose();
        this.textureCache.delete(oldestNum);
      }
    }

    const canvas = this.bakePageCanvas(page, isLeftPage, highlightedWord);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    this.textureCache.set(pageNum, texture);
    this.accessOrder.push(pageNum);

    return texture;
  }

  /**
   * Generates a neutral antique text page texture for intermediate riffle pages
   */
  public getIntermediateRiffleTexture(pageNum: number, isLeftPage: boolean): THREE.CanvasTexture {
    const key = -100 - pageNum;
    if (this.textureCache.has(key)) {
      return this.textureCache.get(key)!;
    }

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    // Vintage paper background
    const bgGrad = isLeftPage
      ? ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0)
      : ctx.createLinearGradient(CANVAS_WIDTH, 0, 0, 0);
    bgGrad.addColorStop(0, '#e6d5ae');
    bgGrad.addColorStop(0.12, '#ecdfba');
    bgGrad.addColorStop(1, '#efe3c0');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Inner aged vignette
    const radGrad = ctx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.3,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.75
    );
    radGrad.addColorStop(0, 'rgba(0,0,0,0)');
    radGrad.addColorStop(1, 'rgba(120, 80, 30, 0.18)');
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Running header line and dummy page number
    const paddingX = 76;
    const paddingY = 52;
    ctx.font = '26px "IM Fell English SC", serif';
    ctx.fillStyle = '#4a3a2c';
    ctx.textAlign = 'center';
    ctx.fillText(`p. ${pageNum}`, CANVAS_WIDTH / 2, paddingY + 20);

    ctx.strokeStyle = '#8a7452';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(paddingX, paddingY + 34);
    ctx.lineTo(CANVAS_WIDTH - paddingX, paddingY + 34);
    ctx.stroke();

    // Subtle ghost text lines to simulate printed dictionary density
    ctx.fillStyle = 'rgba(42, 30, 20, 0.55)';
    const colWidth = (CANVAS_WIDTH - paddingX * 2 - 56) / 2;
    const cols = [paddingX, paddingX + colWidth + 56];

    for (const colX of cols) {
      let y = paddingY + 80;
      while (y < CANVAS_HEIGHT - 120) {
        // Headword bar
        ctx.fillRect(colX, y, 90 + Math.random() * 50, 16);
        y += 24;
        // 2-3 definition lines
        const lines = 2 + Math.floor(Math.random() * 2);
        for (let l = 0; l < lines; l++) {
          ctx.fillRect(colX, y, colWidth - Math.random() * 40, 10);
          y += 18;
        }
        y += 16;
      }
    }

    // Divider
    ctx.strokeStyle = '#b9a57c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(paddingX + colWidth + 28, paddingY + 70);
    ctx.lineTo(paddingX + colWidth + 28, CANVAS_HEIGHT - 100);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.textureCache.set(key, texture);
    return texture;
  }

  /**
   * Renders the authentic book page layout onto an HTML Canvas
   */
  private bakePageCanvas(page: BookPage | null, isLeftPage: boolean, highlightedWord?: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    // 1. Vintage Paper Background Gradient
    const bgGrad = isLeftPage
      ? ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0)
      : ctx.createLinearGradient(CANVAS_WIDTH, 0, 0, 0);

    bgGrad.addColorStop(0, '#e6d5ae');
    bgGrad.addColorStop(0.12, '#ecdfba');
    bgGrad.addColorStop(1, '#efe3c0');

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. Soft Aged Vignette & Inset Shadow
    const radGrad = ctx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.3,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.75
    );
    radGrad.addColorStop(0, 'rgba(0,0,0,0)');
    radGrad.addColorStop(1, 'rgba(120, 80, 30, 0.18)');
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (!page) {
      // Empty endpaper
      ctx.fillStyle = '#8a7452';
      ctx.font = 'italic 32px "IM Fell English", serif';
      ctx.textAlign = 'center';
      ctx.fillText('[Endpaper]', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      return canvas;
    }

    const paddingX = 76;
    const paddingY = 52;
    const normHighlight = highlightedWord?.toLowerCase().trim();

    // 3. Running Guide Words Header
    ctx.font = '26px "IM Fell English SC", serif';
    ctx.fillStyle = '#4a3a2c';
    ctx.textAlign = 'left';
    ctx.fillText(page.guide_left, paddingX, paddingY + 20);

    ctx.textAlign = 'center';
    ctx.fillText(String(page.page_number), CANVAS_WIDTH / 2, paddingY + 20);

    ctx.textAlign = 'right';
    ctx.fillText(page.guide_right, CANVAS_WIDTH - paddingX, paddingY + 20);

    // Header divider line
    ctx.strokeStyle = '#8a7452';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(paddingX, paddingY + 34);
    ctx.lineTo(CANVAS_WIDTH - paddingX, paddingY + 34);
    ctx.stroke();

    // 4. Two Columns Setup
    const colWidth = (CANVAS_WIDTH - paddingX * 2 - 56) / 2;
    const col1X = paddingX;
    const col2X = paddingX + colWidth + 56;
    const startY = paddingY + 70;

    // Draw Column 1
    this.renderColumn(ctx, page.column1, col1X, startY, colWidth, normHighlight);

    // Column Divider Rule
    const dividerX = paddingX + colWidth + 28;
    ctx.strokeStyle = '#b9a57c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(dividerX, startY - 10);
    ctx.lineTo(dividerX, CANVAS_HEIGHT - paddingY - 50);
    ctx.stroke();

    // Draw Column 2
    this.renderColumn(ctx, page.column2, col2X, startY, colWidth, normHighlight);

    // 5. Footer Pronunciation Guide
    ctx.strokeStyle = '#8a7452';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(paddingX, CANVAS_HEIGHT - paddingY - 40);
    ctx.lineTo(CANVAS_WIDTH - paddingX, CANVAS_HEIGHT - paddingY - 40);
    ctx.stroke();

    ctx.font = '24px "Tiro Devanagari Hindi", serif';
    ctx.fillStyle = '#4a3a2c';
    ctx.textAlign = 'center';
    ctx.fillText(page.footer_hints, CANVAS_WIDTH / 2, CANVAS_HEIGHT - paddingY - 12);

    return canvas;
  }

  /**
   * Formats and renders a column of entries with proper line wrapping and highlights
   */
  private renderColumn(
    ctx: CanvasRenderingContext2D,
    entries: BookPage['column1'],
    startX: number,
    startY: number,
    maxWidth: number,
    highlightWord?: string
  ) {
    let currentY = startY;

    for (const entry of entries) {
      if (currentY > CANVAS_HEIGHT - 120) break;

      const isHighlighted = highlightWord && entry.normalized === highlightWord;

      // Draw Headword
      ctx.font = 'bold 30px "IM Fell English", serif';
      ctx.fillStyle = '#2a1e14';
      ctx.textAlign = 'left';
      ctx.fillText(entry.headword, startX, currentY);
      const headwordWidth = ctx.measureText(entry.headword).width;

      // Draw pencil underline under headword if highlighted
      if (isHighlighted) {
        ctx.strokeStyle = 'rgba(50, 55, 70, 0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(startX, currentY + 5);
        ctx.lineTo(startX + headwordWidth, currentY + 5);
        ctx.stroke();
      }

      // Draw Devanagari pronunciation
      ctx.font = '24px "Tiro Devanagari Hindi", serif';
      ctx.fillStyle = '#4a3a2c';
      ctx.fillText(` ${entry.pronunciation_deva}`, startX + headwordWidth, currentY);
      const pronWidth = ctx.measureText(` ${entry.pronunciation_deva}`).width;

      // Draw Part of speech
      ctx.font = 'italic 26px "IM Fell English", serif';
      ctx.fillStyle = '#2a1e14';
      ctx.fillText(` ${entry.pos}`, startX + headwordWidth + pronWidth, currentY);

      currentY += 34;

      // Draw English Definition (with text wrapping)
      ctx.font = '26px/1.3 "IM Fell English", serif';
      ctx.fillStyle = '#2a1e14';
      const words = entry.definition_en.split(' ');
      let line = '';

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, startX, currentY);
          line = words[n] + ' ';
          currentY += 32;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, startX, currentY);
      const lastLineWidth = ctx.measureText(line).width;

      // Draw Hindi Meaning in vintage red ink
      ctx.font = 'bold 26px "Tiro Devanagari Hindi", serif';
      ctx.fillStyle = '#7a2b22';
      if (lastLineWidth + 120 < maxWidth) {
        ctx.fillText(` ${entry.meaning_hi}`, startX + lastLineWidth, currentY);
        currentY += 44;
      } else {
        currentY += 32;
        ctx.fillText(entry.meaning_hi, startX, currentY);
        currentY += 44;
      }
    }
  }

  /**
   * Disposes all textures
   */
  public disposeAll() {
    this.textureCache.forEach((tex) => {
      tex.dispose();
    });
    this.textureCache.clear();
    this.accessOrder = [];
  }
}

export const pageTextureManager = new PageTextureManager();
