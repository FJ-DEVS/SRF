import React, { useRef, useState } from 'react';
import { X, Copy, Download, Share2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { formatStatus, convertModernColorsToRgb } from '../utils/shareUtils';
import { STATUS_COLORS } from '../utils/orderStatus';
import logo1 from '../assets/logo1.png';

const ShareOrderModal = ({ isOpen, onClose, order, showAlert }) => {
  const modalRef = useRef(null);
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!isOpen || !order) return null;

  // Capture the order card as a PNG blob, shared by copy/download/share.
  // onclone inlines rgb colors over Tailwind's oklch() output, which html2canvas can't parse.
  const captureOrderImage = async () => {
    const element = modalRef.current.querySelector('.share-modal-content');

    if (!element) {
      throw new Error('Content element not found');
    }

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

  // Handle copy image to clipboard
  const handleCopyImage = async () => {
    setCopying(true);
    try {
      if (!navigator.clipboard || !window.ClipboardItem) {
        showAlert('Not Supported', 'Copying images is not supported in this browser', 'info');
        return;
      }

      const blob = await captureOrderImage();
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      showAlert('Success', 'Order image copied to clipboard', 'success');
    } catch (error) {
      console.error('Copy image error:', error);
      showAlert('Error', 'Failed to copy image', 'error');
    } finally {
      setCopying(false);
    }
  };

  // Handle download image
  const handleDownloadImage = async () => {
    setDownloading(true);
    try {
      const blob = await captureOrderImage();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `order_${order._id}_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showAlert('Success', 'Order image downloaded', 'success');
    } catch (error) {
      console.error('Download error:', error);
      showAlert('Error', `Failed to generate image: ${error.message}`, 'error');
    } finally {
      setDownloading(false);
    }
  };

  // Handle Web Share API - share as image
  const handleWebShare = async () => {
    try {
      // Check if share is supported at all
      if (typeof navigator.share === 'undefined') {
        showAlert('Not Supported', 'Web Share is not supported in this browser', 'info');
        return;
      }

      const blob = await captureOrderImage();

      // Create file from blob
      const customerName = order.customerName?.name || 'Unknown';
      const file = new File([blob], `order_${order._id}.png`, { type: 'image/png' });
      
      // Check if files can be shared
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        // Fallback: download the image instead
        showAlert('Info', 'File sharing not supported. Downloading instead...', 'info');
        handleDownloadImage();
        return;
      }
      
      // Share the image file
      await navigator.share({
        title: `Order Details - ${customerName}`,
        text: `Order details for ${customerName}`,
        files: [file]
      });
    } catch (error) {
      // User cancelled share
      if (error.name === 'AbortError') {
        return;
      }
      
      console.error('Share error:', error);
      
      // Fallback to download if share fails
      showAlert('Info', 'Sharing not available. Downloading image instead...', 'info');
      handleDownloadImage();
    }
  };

  // Check if Web Share API is supported - show button always, handle errors gracefully
  const isWebShareSupported = true; // Always show the button

  // Format order data for display
  const orderType = order.type === 'sell order' ? 'Sell Order' : 'Purchase Order';
  const customerLabel = order.type === 'sell order' ? 'Customer' : 'Vendor';
  const customerName = order.customerName?.name || '-';
  const date = new Date(order.createdAt).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const createdBy = order.createdByType === 'admin' 
    ? 'Admin' 
    : (order.createdBy?.name || '-');
  const cargoName = order.cargo?.name || 'No Cargo Assigned';
  const isCargoAssigned = !!order.cargo?.name;
  // const statusColor = STATUS_COLORS[order.status] || STATUS_COLORS.cancelled;
  const generatedOn = new Date().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const secondaryFields = [
    { label: 'Order Type', value: orderType },
    { label: customerLabel, value: customerName },
    { label: 'Date', value: date },
    { label: 'Order By', value: createdBy },
  ];

  return (
    <div className="srf-modal-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        className="srf-modal-panel max-w-2xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="srf-modal-header">
          <h3 className="text-lg font-semibold text-slate-900">Share Order Details</h3>
          <button
            onClick={onClose}
            className="srf-icon-btn text-slate-500 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Order Details Content */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          <div className="share-modal-content bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="bg-slate-900 px-6 py-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-white p-1.5 shrink-0">
                  <img src={logo1} alt="SRF" className="h-full w-full object-contain" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-white leading-tight">SRF Trades</h2>
                  <p className="text-[11px] font-medium text-slate-400 tracking-wide">Order Receipt</p>
                </div>
              </div>
              <span className="shrink-0 inline-flex h-7 items-center justify-center rounded-full bg-white/10 px-3 text-[11px] leading-none font-semibold text-white ring-1 ring-inset ring-white/15 whitespace-nowrap">
                {orderType}
              </span>
            </div>

            <div className="p-6">
              {/* Items - primary focus */}
              <div className="mb-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                  Items
                </h3>
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 overflow-hidden">
                  {order.items && order.items.length > 0 ? (
                    order.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-4 px-4 py-3.5 border-b border-blue-100/70 last:border-0"
                      >
                        <span className="text-[15px] font-bold text-slate-900">
                          {item.item?.name || 'Unknown'}
                        </span>
                        <span className="shrink-0 inline-flex h-6 items-center justify-center rounded-full  px-3 text-xs leading-none font-bold text-black whitespace-nowrap">
                          Qty {item.quantity}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-3.5 text-sm text-slate-400 italic">No items</div>
                  )}
                </div>
              </div>

              {/* Secondary details - de-emphasized */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 pt-4 border-t border-slate-100">
                {secondaryFields.map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-600">{value}</p>
                  </div>
                ))}

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Status</p>
                  <span
                    className="mt-1 inline-flex h-5 items-center justify-center rounded-full px-2 text-[11px] leading-none font-semibold"
                    style={{  color: "black" }}
                  >
                    {formatStatus(order.status)}
                  </span>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cargo</p>
                  <p className={`mt-0.5 text-xs font-medium ${isCargoAssigned ? 'text-slate-600' : 'text-slate-400 italic'}`}>
                    {cargoName}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-4">
                <span className="text-[10px] text-slate-400">Order ID: {order._id}</span>
                <span className="text-[10px] text-slate-400">Generated {generatedOn}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="srf-modal-footer flex-wrap gap-2">
          <button
            onClick={handleCopyImage}
            disabled={copying}
            className="srf-btn srf-btn-secondary flex items-center gap-2"
            aria-label="Copy order details image to clipboard"
          >
            <Copy className="w-4 h-4" />
            {copying ? 'Copying...' : 'Copy Image'}
          </button>

          <button
            onClick={handleDownloadImage}
            disabled={downloading}
            className="srf-btn srf-btn-secondary flex items-center gap-2"
            aria-label="Download order details as image"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Downloading...' : 'Download Image'}
          </button>

          {isWebShareSupported && (
            <button
              onClick={handleWebShare}
              className="srf-btn srf-btn-secondary flex items-center gap-2"
              aria-label="Share order details"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          )}

          <button
            onClick={onClose}
            className="srf-btn srf-btn-primary ml-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareOrderModal;
