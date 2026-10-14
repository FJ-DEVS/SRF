import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import html2canvas from 'html2canvas';
import OrderShareCard from '../components/OrderShareCard';
import { convertModernColorsToRgb } from './shareUtils';

// Capture a rendered order card as a PNG blob.
// onclone inlines rgb colors over Tailwind's oklch() output, which html2canvas can't parse.
export const captureOrderImage = async (element) => {
  // Wait for the Inter/Plus Jakarta Sans webfonts to finish loading first - otherwise
  // html2canvas snapshots the fallback font's metrics, which throws off the tight
  // vertical centering on the pill/badge elements (text renders clipped or offset).
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    logging: false,
    useCORS: true,
    allowTaint: true,
    // html2canvas also reads the cloned <html>/<body> background color (for the canvas
    // backdrop fallback) before rendering the target subtree, so the whole cloned
    // document needs sanitizing, not just the captured element.
    onclone: (clonedDoc) => convertModernColorsToRgb(clonedDoc.documentElement),
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to generate image'));
    }, 'image/png', 1.0);
  });
};

// The same image the share modal makes, without opening it: the card is
// mounted off-screen at the modal's content width, captured, then removed.
export const renderOrderImage = async (order) => {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:624px;pointer-events:none;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<OrderShareCard order={order} />));
    return await captureOrderImage(host.firstElementChild);
  } finally {
    root.unmount();
    host.remove();
  }
};
