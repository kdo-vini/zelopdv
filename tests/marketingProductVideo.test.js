import { describe, expect, it } from 'vitest';
import {
  VIDEO_MOBILE_MAX_WIDTH,
  createStartedOnceTracker,
  pickVideoFormat,
  videoAssetPaths,
} from '../src/lib/marketing/productVideo.js';

describe('pickVideoFormat', () => {
  it('escolhe mobile até o corte (inclusive)', () => {
    expect(pickVideoFormat(320)).toBe('mobile');
    expect(pickVideoFormat(390)).toBe('mobile');
    expect(pickVideoFormat(VIDEO_MOBILE_MAX_WIDTH)).toBe('mobile');
  });

  it('escolhe desktop acima do corte', () => {
    expect(pickVideoFormat(VIDEO_MOBILE_MAX_WIDTH + 1)).toBe('desktop');
    expect(pickVideoFormat(1280)).toBe('desktop');
  });
});

describe('videoAssetPaths', () => {
  it('monta o mp4 e o poster webp a partir do nome e formato, sem webm', () => {
    expect(videoAssetPaths('venda', 'mobile')).toEqual({
      src: '/videos/landing/venda-mobile.mp4',
      poster: '/videos/landing/venda-mobile.webp',
    });
    expect(videoAssetPaths('zelinho', 'desktop')).toEqual({
      src: '/videos/landing/zelinho-desktop.mp4',
      poster: '/videos/landing/zelinho-desktop.webp',
    });
  });
});

describe('createStartedOnceTracker', () => {
  it('dispara true só na primeira vez por nome', () => {
    const markStarted = createStartedOnceTracker();
    expect(markStarted('venda')).toBe(true);
    expect(markStarted('venda')).toBe(false);
    expect(markStarted('venda')).toBe(false);
  });

  it('trata nomes diferentes de forma independente', () => {
    const markStarted = createStartedOnceTracker();
    expect(markStarted('venda')).toBe(true);
    expect(markStarted('fiado')).toBe(true);
    expect(markStarted('venda')).toBe(false);
  });

  it('trackers separados não compartilham estado', () => {
    const trackerA = createStartedOnceTracker();
    const trackerB = createStartedOnceTracker();
    expect(trackerA('zelinho')).toBe(true);
    expect(trackerB('zelinho')).toBe(true);
  });
});
