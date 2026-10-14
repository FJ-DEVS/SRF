import React, { useRef, useState } from 'react';
import { X, Copy, Download, Share2 } from 'lucide-react';
import { STATUS_COLORS } from '../utils/orderStatus';
import { captureOrderImage as captureCard } from '../utils/orderImage';
import OrderShareCard from './OrderShareCard';

const ShareOrderModal = ({ isOpen, onClose, order, showAlert }) => {
  const modalRef = useRef(null);
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!isOpen || !order) return null;

  // Capture the order card as a PNG blob, shared by copy/download/share.
  const captureOrderImage = async () => {
    const element = modalRef.current.querySelector('.share-modal-content');

    if (!element) {
      throw new Error('Content element not found');
    }

    return captureCard(element);
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
          <OrderShareCard order={order} />
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
