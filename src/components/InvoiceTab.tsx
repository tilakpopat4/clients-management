import React, { useState, useEffect, useRef } from 'react';
import { Client, Reel, Invoice, WorkItem, UserProfile } from '../types';
import { Plus, Trash2, Download, Receipt, FileCheck, Mail, Send, Copy, X, Check, MailCheck, CheckCircle2, AlertCircle, Loader2, FileText, Search, Calculator, Divide, Coins } from 'lucide-react';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { useFirestore } from '../hooks/useFirestore';
import { User } from 'firebase/auth';
import { generateUUID } from '../lib/utils';
import { generateInvoiceEmailDetails } from '../lib/paymentUtils';
import Logo from './Logo';
import QRCode from 'qrcode';
import { sendEmailWithPdfAttachment, acquireGmailAccessToken } from '../lib/gmailService';

// Helper functions to parse and convert oklab/oklch/color() colors to standard rgb/rgba,
// which prevents crashes in html2canvas (used by html2pdf.js) under Tailwind CSS v4.
let colorCanvas: HTMLCanvasElement | null = null;
let colorCtx: CanvasRenderingContext2D | null = null;

function cssColorToRgb(colorStr: string): string {
  if (typeof window === 'undefined') return colorStr;
  try {
    if (!colorCanvas) {
      colorCanvas = document.createElement('canvas');
      colorCanvas.width = 1;
      colorCanvas.height = 1;
      colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (colorCtx) {
      colorCtx.clearRect(0, 0, 1, 1);
      colorCtx.fillStyle = '#000000';
      colorCtx.fillStyle = colorStr;
      colorCtx.fillRect(0, 0, 1, 1);
      const data = colorCtx.getImageData(0, 0, 1, 1).data;
      const alpha = +(data[3] / 255).toFixed(2);
      if (alpha === 1) {
        return `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
      } else {
        return `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${alpha})`;
      }
    }
  } catch (e) {
    // fallback
  }
  return colorStr;
}

function oklabToRgb(l_val: number, a_val: number, b_val: number): { r: number, g: number, b: number } {
  const l = l_val + 0.3963377774 * a_val + 0.2158037573 * b_val;
  const m = l_val - 0.1055613458 * a_val - 0.0638541728 * b_val;
  const s = l_val - 0.0894841775 * a_val - 1.2914855480 * b_val;

  const l_3 = l * l * l;
  const m_3 = m * m * m;
  const s_3 = s * s * s;

  let r_lin = +4.0767416621 * l_3 - 3.3077115913 * m_3 + 0.2309699292 * s_3;
  let g_lin = -1.2684380046 * l_3 + 2.6097574011 * m_3 - 0.3413193965 * s_3;
  let b_lin = -0.0041960863 * l_3 - 0.7034186147 * m_3 + 1.7076147010 * s_3;

  const gamma = (c: number) => {
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };

  const r_res = Math.round(Math.max(0, Math.min(1, gamma(r_lin))) * 255);
  const g_res = Math.round(Math.max(0, Math.min(1, gamma(g_lin))) * 255);
  const b_res = Math.round(Math.max(0, Math.min(1, gamma(b_lin))) * 255);

  return { r: r_res, g: g_res, b: b_res };
}

function convertOklabStringToRgb(oklabStr: string): string {
  const match = oklabStr.match(/oklab\(([^)]+)\)/);
  if (!match) return oklabStr;

  const partsStr = match[1].trim();
  const parts = partsStr.split(/[\s,/]+/);
  if (parts.length < 3) return oklabStr;

  const parseVal = (str: string, base: number = 1) => {
    if (str.endsWith('%')) {
      return (parseFloat(str) / 100) * base;
    }
    return parseFloat(str);
  };

  let l_val = parseVal(parts[0], 1);
  if (l_val > 1 && !parts[0].endsWith('%')) {
    l_val = l_val / 100;
  }

  const a_val = parseVal(parts[1], 1);
  const b_val = parseVal(parts[2], 1);

  const alphaStr = parts[3];
  const alpha = alphaStr !== undefined ? parseVal(alphaStr, 1) : 1;

  const { r, g, b } = oklabToRgb(l_val, a_val, b_val);

  if (alpha === 1) {
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

function oklchToRgb(l_val: number, c_val: number, h_val: number): { r: number, g: number, b: number } {
  // h_val is in degrees, convert to radians
  const h_rad = (h_val * Math.PI) / 180;
  const a = c_val * Math.cos(h_rad);
  const b = c_val * Math.sin(h_rad);

  const l = l_val + 0.3963377774 * a + 0.2158037573 * b;
  const m = l_val - 0.1055613458 * a - 0.0638541728 * b;
  const s = l_val - 0.0894841775 * a - 1.2914855480 * b;

  const l_3 = l * l * l;
  const m_3 = m * m * m;
  const s_3 = s * s * s;

  let r_lin = +4.0767416621 * l_3 - 3.3077115913 * m_3 + 0.2309699292 * s_3;
  let g_lin = -1.2684380046 * l_3 + 2.6097574011 * m_3 - 0.3413193965 * s_3;
  let b_lin = -0.0041960863 * l_3 - 0.7034186147 * m_3 + 1.7076147010 * s_3;

  const gamma = (c: number) => {
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };

  const r_val = Math.round(Math.max(0, Math.min(1, gamma(r_lin))) * 255);
  const g_val = Math.round(Math.max(0, Math.min(1, gamma(g_lin))) * 255);
  const b_val = Math.round(Math.max(0, Math.min(1, gamma(b_lin))) * 255);

  return { r: r_val, g: g_val, b: b_val };
}

function convertOklchStringToRgb(oklchStr: string): string {
  const match = oklchStr.match(/oklch\(([^)]+)\)/);
  if (!match) return oklchStr;

  const partsStr = match[1].trim();
  const parts = partsStr.split(/[\s,/]+/);
  if (parts.length < 3) return oklchStr;

  const parseVal = (str: string, base: number = 1) => {
    if (str.endsWith('%')) {
      return (parseFloat(str) / 100) * base;
    }
    return parseFloat(str);
  };

  let l_val = parseVal(parts[0], 1);
  if (l_val > 1 && !parts[0].endsWith('%')) {
    l_val = l_val / 100;
  }

  const c_val = parseVal(parts[1], 1);
  const h_val = parseVal(parts[2], 1);

  const alphaStr = parts[3];
  const alpha = alphaStr !== undefined ? parseVal(alphaStr, 1) : 1;

  const { r, g, b } = oklchToRgb(l_val, c_val, h_val);

  if (alpha === 1) {
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

function replaceUnsupportedColorsWithRgb(str: string): string {
  if (typeof str !== 'string') return str;
  if (!str.includes('oklch') && !str.includes('oklab') && !str.includes('color(')) return str;

  return str.replace(/(oklab|oklch|color)\([^)]+\)/g, (match) => {
    try {
      const converted = cssColorToRgb(match);
      if (converted && converted.startsWith('rgb')) {
        return converted;
      }
      if (match.startsWith('oklab')) {
        return convertOklabStringToRgb(match);
      }
      if (match.startsWith('oklch')) {
        return convertOklchStringToRgb(match);
      }
    } catch (e) {
      console.warn("Failed to parse/convert color:", match, e);
    }
    return 'rgb(15, 23, 42)';
  });
}

function preprocessElementStylesForPdf(element: HTMLElement): () => void {
  const originalStyles = new Map<HTMLElement, string>();
  const colorProperties = [
    'color',
    'backgroundColor',
    'borderColor',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'outlineColor',
    'textDecorationColor',
    'boxShadow',
    'fill',
    'stroke',
    'backgroundImage',
    'background'
  ];

  try {
    const elements = [element, ...Array.from(element.querySelectorAll('*'))] as HTMLElement[];
    for (const el of elements) {
      if (!el.style) continue;
      originalStyles.set(el, el.getAttribute('style') || '');
      const computed = window.getComputedStyle(el);
      for (const prop of colorProperties) {
        try {
          const val = computed[prop as any];
          if (typeof val === 'string' && (val.includes('oklch') || val.includes('oklab') || val.includes('color('))) {
            const converted = replaceUnsupportedColorsWithRgb(val);
            el.style[prop as any] = converted;
          }
        } catch (e) {
          // ignore individual property errors
        }
      }
    }
  } catch (err) {
    console.warn("Failed to preprocess oklab/oklch styles on elements:", err);
  }

  return () => {
    for (const [el, style] of originalStyles.entries()) {
      try {
        if (style) {
          el.setAttribute('style', style);
        } else {
          el.removeAttribute('style');
        }
      } catch (e) {
        // ignore restore errors
      }
    }
  };
}

export async function generateOffscreenPdfBlob(params: {
  invoice: Invoice;
  client?: Client;
  profile: UserProfile | null;
  dateFrom?: string;
  dateTo?: string;
  qrCodeUrl?: string;
}): Promise<Blob> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '0px';
  container.style.top = '0px';
  container.style.zIndex = '999999';
  container.style.opacity = '1';
  container.style.pointerEvents = 'none';
  container.style.width = '794px';
  container.style.backgroundColor = '#ffffff';
  container.style.boxSizing = 'border-box';
  container.style.padding = '32px 36px';
  container.style.fontFamily = 'Inter, system-ui, -apple-system, sans-serif';
  container.style.color = '#0f172a';

  const invoiceNo = params.invoice.id.length > 8 
    ? `INV-${params.invoice.id.substring(0, 8).toUpperCase()}`
    : params.invoice.id.toUpperCase();

  const issueDateStr = new Date(params.invoice.date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  const billingPeriodStr = params.dateFrom && params.dateTo
    ? `${new Date(params.dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(params.dateTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : issueDateStr;

  const lastPaymentStr = params.invoice.lastPaymentDate
    ? new Date(params.invoice.lastPaymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : (params.client?.lastPaymentDate 
        ? new Date(params.client.lastPaymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'N/A (First Cycle)');

  const senderName = params.profile?.name || 'Video Editor';
  const senderTitle = params.profile?.professionalTitle || params.profile?.servicesDescription || 'Professional Video Editing & Content Creation';
  const senderPhone = params.profile?.phone || '';
  const upiId = params.profile?.upiId || 'Not specified';

  const reels = params.invoice.reels || [];
  const subtotal = reels.reduce((s, r) => s + (r.quantity * r.rate), 0);
  const discount = params.invoice.discountAmount || 0;
  const grandTotal = Math.max(0, params.invoice.totalAmount);

  let qrUrl = params.qrCodeUrl || '';
  if (!qrUrl && upiId && upiId !== 'Not specified') {
    try {
      const upiUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(senderName)}&am=${grandTotal}`;
      qrUrl = await QRCode.toDataURL(upiUri, { width: 240, margin: 1 });
    } catch (e) {
      console.warn("QR code generation for offscreen PDF failed:", e);
    }
  }

  const itemsRowsHtml = reels.length === 0
    ? `
      <tr>
        <td style="padding: 12px 10px; font-size: 13px; color: #64748b; text-align: center;">01</td>
        <td style="padding: 12px 10px; font-size: 14px; color: #0f172a; font-weight: 600;">Video Editing / Content Creation Services</td>
        <td style="padding: 12px 10px; font-size: 14px; color: #334155; text-align: center;">1</td>
        <td style="padding: 12px 10px; font-size: 14px; color: #334155; text-align: right;">₹${grandTotal.toLocaleString('en-IN')}</td>
        <td style="padding: 12px 10px; font-size: 14px; color: #0f172a; font-weight: 700; text-align: right;">₹${grandTotal.toLocaleString('en-IN')}</td>
      </tr>
    `
    : reels.map((r, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 12px 10px; font-size: 13px; color: #64748b; text-align: center;">${String(idx + 1).padStart(2, '0')}</td>
        <td style="padding: 12px 10px; font-size: 14px; color: #0f172a; font-weight: 600;">${r.title || 'Video Editing Work Item'}</td>
        <td style="padding: 12px 10px; font-size: 14px; color: #334155; text-align: center;">${r.quantity}</td>
        <td style="padding: 12px 10px; font-size: 14px; color: #334155; text-align: right;">₹${r.rate.toLocaleString('en-IN')}</td>
        <td style="padding: 12px 10px; font-size: 14px; color: #0f172a; font-weight: 700; text-align: right;">₹${(r.quantity * r.rate).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');

  container.innerHTML = `
    <div>
      <table style="width: 100%; border-bottom: 2px solid #0f172a; padding-bottom: 18px; margin-bottom: 22px;">
        <tr>
          <td style="vertical-align: top; width: 65%;">
            <div style="font-size: 22px; font-weight: 900; text-transform: uppercase; color: #0f172a; letter-spacing: -0.5px;">
              ${senderName}
            </div>
            <div style="font-size: 11px; font-weight: 700; color: #4f46e5; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px;">
              ${senderTitle}
            </div>
            ${senderPhone ? `<div style="font-size: 12px; color: #475569; margin-top: 6px;"><b>PHONE:</b> ${senderPhone}</div>` : ''}
          </td>
          <td style="vertical-align: top; width: 35%; text-align: right;">
            <div style="font-size: 30px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: -0.5px; line-height: 1;">
              INVOICE
            </div>
            <div style="font-size: 13px; font-family: monospace; font-weight: 700; color: #475569; margin-top: 4px;">
              #${invoiceNo}
            </div>
          </td>
        </tr>
      </table>

      <table style="width: 100%; margin-bottom: 22px; border-spacing: 12px 0; border-collapse: separate;">
        <tr>
          <td style="width: 50%; vertical-align: top; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; display: block; margin-bottom: 6px;">
              BILLED TO
            </span>
            <div style="font-size: 18px; font-weight: 900; color: #0f172a; margin-bottom: 4px;">
              ${params.client?.name || params.invoice.clientName}
            </div>
            ${params.client?.phone ? `<div style="font-size: 12px; color: #475569;">Ph: ${params.client.phone}</div>` : ''}
            ${params.client?.email ? `<div style="font-size: 12px; color: #475569;">Email: ${params.client.email}</div>` : ''}
          </td>
          <td style="width: 50%; vertical-align: top; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; display: block; margin-bottom: 6px;">
              INVOICE OVERVIEW
            </span>
            <table style="width: 100%; font-size: 12px; color: #334155;">
              <tr>
                <td style="color: #64748b; padding: 2px 0;">Issue Date:</td>
                <td style="text-align: right; font-weight: 700; color: #0f172a;">${issueDateStr}</td>
              </tr>
              <tr>
                <td style="color: #64748b; padding: 2px 0;">Billing Period:</td>
                <td style="text-align: right; font-weight: 600; color: #1e293b;">${billingPeriodStr}</td>
              </tr>
              <tr>
                <td style="color: #64748b; padding: 2px 0;">Last Payment Date:</td>
                <td style="text-align: right; font-weight: 600; color: #1e293b;">${lastPaymentStr}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px;">
        <thead>
          <tr style="background-color: #0f172a; color: #ffffff;">
            <th style="padding: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; width: 40px; border-top-left-radius: 8px;">#</th>
            <th style="padding: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: left;">Item Description / Work Log</th>
            <th style="padding: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; width: 60px;">Qty</th>
            <th style="padding: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: right; width: 100px;">Rate</th>
            <th style="padding: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: right; width: 120px; border-top-right-radius: 8px;">Total Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
        </tbody>
      </table>

      <table style="width: 100%; margin-bottom: 24px;">
        <tr>
          <td style="width: 45%;"></td>
          <td style="width: 55%; vertical-align: top;">
            <table style="width: 100%; font-size: 13px; color: #475569;">
              <tr>
                <td style="padding: 4px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b;">Subtotal</td>
                <td style="padding: 4px 0; text-align: right; font-weight: 700; color: #0f172a;">₹${subtotal.toLocaleString('en-IN')}</td>
              </tr>
              ${discount > 0 ? `
              <tr>
                <td style="padding: 4px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #e11d48;">
                  Deduction (${params.invoice.discountDescription || 'Discount'})
                </td>
                <td style="padding: 4px 0; text-align: right; font-weight: 700; color: #e11d48;">
                  -₹${discount.toLocaleString('en-IN')}
                </td>
              </tr>
              ` : ''}
            </table>

            <div style="background-color: #0f172a; color: #ffffff; padding: 12px 16px; border-radius: 12px; margin-top: 6px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #a5b4fc;">TOTAL DUE</div>
                <div style="font-size: 10px; color: #94a3b8; margin-top: 1px;">Payable via UPI / Bank</div>
              </div>
              <div style="font-size: 22px; font-weight: 900; color: #ffffff;">₹${grandTotal.toLocaleString('en-IN')}</div>
            </div>
          </td>
        </tr>
      </table>

      <table style="width: 100%; border-top: 2px solid #0f172a; padding-top: 18px;">
        <tr>
          <td style="vertical-align: top; width: 68%;">
            <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #0f172a; margin-bottom: 8px;">
              PAYMENT INFORMATION
            </div>
            <table style="width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; font-size: 12px; color: #1e293b;">
              <tr>
                <td style="padding: 3px 0; color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase; width: 35%;">Payment Method:</td>
                <td style="padding: 3px 0; font-weight: 600; color: #0f172a;">UPI Transfer</td>
              </tr>
              <tr>
                <td style="padding: 3px 0; color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase;">UPI ID:</td>
                <td style="padding: 3px 0; font-family: monospace; font-weight: 700; color: #4f46e5;">${upiId}</td>
              </tr>
              <tr>
                <td style="padding: 3px 0; color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase;">Payee Name:</td>
                <td style="padding: 3px 0; font-weight: 600; color: #0f172a;">${senderName}</td>
              </tr>
              ${params.profile?.accountNumber ? `
              <tr>
                <td style="padding: 3px 0; color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase;">Bank Account:</td>
                <td style="padding: 3px 0; font-family: monospace; font-weight: 600;">${params.profile.accountNumber}</td>
              </tr>
              <tr>
                <td style="padding: 3px 0; color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase;">IFSC / Bank:</td>
                <td style="padding: 3px 0; font-weight: 600;">${params.profile.ifscCode || ''} ${params.profile.bankName ? `(${params.profile.bankName})` : ''}</td>
              </tr>
              ` : ''}
            </table>
            <p style="font-size: 11px; color: #64748b; font-style: italic; margin-top: 8px;">
              Thank you for your business! Please process payment within 7 days of receiving this invoice statement.
            </p>
          </td>
          <td style="vertical-align: top; width: 32%; text-align: center; padding-left: 12px;">
            <div style="background: #ffffff; border: 2px solid #e2e8f0; border-radius: 12px; padding: 10px; display: inline-block;">
              ${qrUrl ? `<img src="${qrUrl}" style="width: 110px; height: 110px; border-radius: 6px; display: block; margin: 0 auto;" />` : '<div style="width: 110px; height: 110px; line-height: 110px; font-size: 11px; color: #94a3b8; text-align: center;">Scan to Pay</div>'}
              <span style="font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; display: block; margin-top: 6px;">
                Scan with GPay / Paytm
              </span>
            </div>
          </td>
        </tr>
      </table>

      <div style="margin-top: 18px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between;">
        <span>This is a computer-generated invoice statement.</span>
        <span>Generated on ${issueDateStr}</span>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  // Ensure images (e.g. QR code) and fonts are fully decoded and rendered
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(images.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  }));

  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (e) {
      // ignore
    }
  }

  // Brief pause to allow DOM repaint
  await new Promise(r => setTimeout(r, 120));

  let html2pdfFunc = html2pdf;
  if (html2pdfFunc && (html2pdfFunc as any).default) {
    html2pdfFunc = (html2pdfFunc as any).default;
  }
  if (typeof html2pdfFunc !== 'function' && typeof window !== 'undefined' && (window as any).html2pdf) {
    html2pdfFunc = (window as any).html2pdf;
  }

  const opt = {
    margin: [8, 8, 8, 8] as [number, number, number, number],
    filename: `Invoice_${(params.client?.name || params.invoice.clientName).replace(/\s+/g, '_')}_${invoiceNo}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { 
      scale: 2, 
      useCORS: true, 
      logging: false, 
      width: 794,
      windowWidth: 794,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      backgroundColor: '#ffffff'
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['.avoid-break'] }
  };

  const restoreStyles = preprocessElementStylesForPdf(container);

  try {
    const worker = html2pdfFunc().set(opt).from(container);
    const pdfBlob = await worker.output('blob');
    restoreStyles();
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
    return pdfBlob;
  } catch (err) {
    restoreStyles();
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
    throw err;
  }
}

interface InvoiceTabProps {
  user: User | null;
  profile: UserProfile | null;
  initialSearchQuery?: string;
}

export default function InvoiceTab({ user, profile, initialSearchQuery = '' }: InvoiceTabProps) {
  const { data: clients, loading: clientsLoading, addOrUpdateItem: updateClient } = useFirestore<Client>('clients', user?.uid);
  const { data: invoices, addOrUpdateItem: addInvoice } = useFirestore<Invoice>('invoices', user?.uid);
  const { data: workItems, addOrUpdateItem: updateWorkItem } = useFirestore<WorkItem>('workItems', user?.uid);
  
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState<string>(initialSearchQuery);

  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setInvoiceSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${month}-01`;
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  });
  const [reels, setReels] = useState<Reel[]>([]);
  const [linkedWorkItemIds, setLinkedWorkItemIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [discountDescription, setDiscountDescription] = useState<string>('');
  const [directGrandTotalInput, setDirectGrandTotalInput] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isSendingGmail, setIsSendingGmail] = useState(false);
  const [emailModalData, setEmailModalData] = useState<{
    isOpen: boolean;
    clientName: string;
    clientEmail: string;
    subject: string;
    body: string;
    mailtoLink: string;
    monthCycleStr: string;
    invoiceNo: string;
    totalAmount: number;
    pdfBlob?: Blob;
    pdfFilename?: string;
    invoiceObj?: Invoice;
    clientObj?: Client;
    gmailStatus?: { sending: boolean; success?: boolean; error?: string; messageId?: string };
  } | null>(null);

  const selectedClient = clients.find(c => c.id === selectedClientId);

  useEffect(() => {
    if (selectedClientId && dateFrom && dateTo) {
      // Find uninvoiced work items for this client in the selected date span
      const uninvoicedWork = workItems.filter(w => {
        if (w.clientId !== selectedClientId) return false;
        if (w.status !== 'Uninvoiced') return false;
        
        const workDate = new Date(w.date);
        const yyyy = workDate.getFullYear();
        const mm = String(workDate.getMonth() + 1).padStart(2, '0');
        const dd = String(workDate.getDate()).padStart(2, '0');
        const workDateStr = `${yyyy}-${mm}-${dd}`;
        
        return workDateStr >= dateFrom && workDateStr <= dateTo;
      });
      
      // Sort work log in ascending chronological order (earliest date first)
      uninvoicedWork.sort((a, b) => (a.date - b.date) || (a.createdAt - b.createdAt));
      
      if (uninvoicedWork.length > 0) {
        setReels(uninvoicedWork.map(w => ({
          id: generateUUID(),
          title: w.description,
          quantity: w.quantity,
          rate: w.rate
        })));
        setLinkedWorkItemIds(uninvoicedWork.map(w => w.id));
      } else {
        setReels([{ id: generateUUID(), title: '', quantity: 1, rate: selectedClient ? selectedClient.defaultRate : 0 }]);
        setLinkedWorkItemIds([]);
      }
    }
  }, [selectedClientId, dateFrom, dateTo, workItems]);

  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedClientId(e.target.value);
  };

  const addItem = (defaultTitle: string, defaultRate: number) => {
    setReels([
      ...reels,
      { id: generateUUID(), title: defaultTitle, quantity: 1, rate: defaultRate }
    ]);
  };

  const updateReel = (id: string, field: keyof Reel, value: string | number) => {
    setReels(reels.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeReel = (id: string) => {
    if (reels.length > 1) {
      setReels(reels.filter(r => r.id !== id));
    }
  };

  const handleApplyDirectGrandTotal = () => {
    const targetVal = Number(directGrandTotalInput);
    if (isNaN(targetVal) || directGrandTotalInput.trim() === '') {
      alert("Please enter a valid amount for the Grand Total.");
      return;
    }
    if (targetVal < 0) {
      alert("Grand total cannot be negative.");
      return;
    }

    const discount = Number(discountAmount) || 0;
    const targetSubtotal = targetVal + discount;

    if (reels.length === 0) {
      setReels([{ id: generateUUID(), title: 'Video Editing Services', quantity: 1, rate: Math.round(targetSubtotal) }]);
      return;
    }

    const n = reels.length;
    // Divide targetSubtotal cleanly into whole integer rupees across all reels
    const totalRupees = Math.round(targetSubtotal);
    const baseRupees = Math.floor(totalRupees / n);
    let remainingRupees = totalRupees - (baseRupees * n);

    const newReels = reels.map((reel, idx) => {
      const itemRupees = baseRupees + (idx < remainingRupees ? 1 : 0);
      const qty = reel.quantity > 0 ? reel.quantity : 1;
      const computedRate = Math.round(itemRupees / qty);
      return {
        ...reel,
        rate: computedRate
      };
    });

    setReels(newReels);
  };

  const roundToNearestHundred = (amount: number): number => {
    if (amount <= 0) return 0;
    // Standard hundred rounding: >150 -> 200, <150 -> 100
    const rounded = Math.round(amount / 100) * 100;
    return rounded === 0 && amount > 0 ? 100 : rounded;
  };

  const handleRoundFigures = () => {
    if (reels.length === 0) return;

    const newReels = reels.map(reel => {
      const qty = reel.quantity > 0 ? reel.quantity : 1;
      const currentLineTotal = reel.quantity * reel.rate;
      const roundedLineTotal = roundToNearestHundred(currentLineTotal);
      const newRate = Math.max(1, Math.round(roundedLineTotal / qty));
      return {
        ...reel,
        rate: newRate
      };
    });

    setReels(newReels);

    const newSubtotal = newReels.reduce((sum, r) => sum + (r.quantity * r.rate), 0);
    const discount = Number(discountAmount) || 0;
    const newGrandTotal = Math.max(0, newSubtotal - discount);
    setDirectGrandTotalInput(newGrandTotal.toString());
  };

  const calculateTotal = () => {
    return reels.reduce((sum, reel) => sum + (reel.quantity * reel.rate), 0);
  };

  const total = calculateTotal();
  const discount = Number(discountAmount) || 0;
  const grandTotal = Math.max(0, total - discount);

  useEffect(() => {
    const payeeName = encodeURIComponent(profile?.name || user?.displayName || 'Video Editor');
    const upiId = profile?.upiId || '';
    const upiUrl = `upi://pay?pa=${upiId}&pn=${payeeName}&am=${grandTotal}`;
    QRCode.toDataURL(upiUrl, { width: 260, margin: 1 })
      .then(url => setQrCodeUrl(url))
      .catch(err => console.error("Failed to generate QR Code:", err));
  }, [grandTotal, user, profile]);

  const handleDownload = async () => {
    if (!selectedClient) {
      alert("Please select a client first.");
      return;
    }
    
    if (reels.some(r => !r.title.trim())) {
      alert("Please provide a title for all reels.");
      return;
    }

    setIsGenerating(true);

    try {
      const newInvoice: Invoice = {
        id: generateUUID(),
        date: Date.now(),
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        reels: [...reels],
        totalAmount: grandTotal,
        status: 'Pending',
        ...(selectedClient.lastPaymentDate ? { lastPaymentDate: selectedClient.lastPaymentDate } : {}),
        ...(discount > 0 ? {
          discountAmount: discount,
          discountDescription: discountDescription.trim() || 'Discount/Deduction'
        } : {})
      };

      const filename = `Invoice_${selectedClient.name.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.pdf`;

      // 1. Generate crisp, unscaled offscreen PDF blob
      const pdfBlob = await generateOffscreenPdfBlob({
        invoice: newInvoice,
        client: selectedClient,
        profile,
        dateFrom,
        dateTo,
        qrCodeUrl
      });

      // 2. Trigger browser download
      try {
        const downloadUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e) {
        console.warn("Blob download fallback:", e);
      }

      // 3. Save invoice to cloud storage
      await addInvoice(newInvoice);

      // 4. Mark linked work items as invoiced
      for (const workId of linkedWorkItemIds) {
        const workItem = workItems.find(w => w.id === workId);
        if (workItem) {
          await updateWorkItem({ ...workItem, status: 'Invoiced', invoiceId: newInvoice.id });
        }
      }

      // 5. Clear form selection
      setReels([{ id: generateUUID(), title: '', quantity: 1, rate: selectedClient.defaultRate }]);
      setLinkedWorkItemIds([]);
      setDiscountAmount('');
      setDiscountDescription('');

      // 6. Generate email details for this specific invoice
      const emailDetails = generateInvoiceEmailDetails(selectedClient, newInvoice, profile, dateFrom, dateTo);
      const targetClientEmail = selectedClient.email ? selectedClient.email.trim() : '';
      let initialGmailStatus: { sending: boolean; success?: boolean; error?: string; messageId?: string } = { sending: false };

      if (targetClientEmail) {
        initialGmailStatus = { sending: true };
        sendEmailWithPdfAttachment({
          to: targetClientEmail,
          subject: emailDetails.subject,
          bodyText: emailDetails.body,
          pdfBlob: pdfBlob,
          pdfFilename: filename
        }).then(res => {
          if (res.success) {
            setEmailModalData(prev => prev ? {
              ...prev,
              gmailStatus: { sending: false, success: true, messageId: res.id }
            } : null);
          } else {
            setEmailModalData(prev => prev ? {
              ...prev,
              gmailStatus: { sending: false, success: false, error: res.error }
            } : null);
          }
        });
      }

      setEmailModalData({
        isOpen: true,
        clientName: selectedClient.name,
        clientEmail: targetClientEmail,
        subject: emailDetails.subject,
        body: emailDetails.body,
        mailtoLink: emailDetails.mailtoLink,
        monthCycleStr: emailDetails.monthCycleStr,
        invoiceNo: emailDetails.invoiceNo,
        totalAmount: grandTotal,
        pdfBlob: pdfBlob,
        pdfFilename: filename,
        invoiceObj: newInvoice,
        clientObj: selectedClient,
        gmailStatus: initialGmailStatus
      });

    } catch (err: any) {
      console.error("PDF generation / save error:", err);
      alert("An error occurred while generating or saving the PDF: " + (err?.message || String(err)));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendGmailManual = async () => {
    if (!emailModalData) return;
    const recipient = emailModalData.clientEmail.trim();
    if (!recipient) {
      alert("Please enter a recipient email address.");
      return;
    }

    setIsSendingGmail(true);
    setEmailModalData(prev => prev ? { ...prev, gmailStatus: { sending: true } } : null);

    try {
      let currentPdfBlob = emailModalData.pdfBlob;
      if (!currentPdfBlob && emailModalData.invoiceObj) {
        currentPdfBlob = await generateOffscreenPdfBlob({
          invoice: emailModalData.invoiceObj,
          client: emailModalData.clientObj,
          profile
        });
      }

      const token = await acquireGmailAccessToken();
      const res = await sendEmailWithPdfAttachment({
        to: recipient,
        subject: emailModalData.subject,
        bodyText: emailModalData.body,
        pdfBlob: currentPdfBlob,
        pdfFilename: emailModalData.pdfFilename || `Invoice_${emailModalData.invoiceNo}.pdf`,
        accessToken: token
      });

      if (res.success) {
        setEmailModalData(prev => prev ? {
          ...prev,
          pdfBlob: currentPdfBlob,
          gmailStatus: { sending: false, success: true, messageId: res.id }
        } : null);
      } else {
        setEmailModalData(prev => prev ? {
          ...prev,
          gmailStatus: { sending: false, success: false, error: res.error }
        } : null);
      }
    } catch (err: any) {
      console.error("Gmail manual send error:", err);
      setEmailModalData(prev => prev ? {
        ...prev,
        gmailStatus: { sending: false, success: false, error: err?.message || String(err) }
      } : null);
    } finally {
      setIsSendingGmail(false);
    }
  };

  if (clientsLoading) {
    return <div className="p-8 max-w-[1600px] mx-auto text-center py-20"><div className="animate-pulse flex items-center justify-center space-x-2"><div className="w-2 h-2 bg-indigo-600 rounded-full"></div><div className="w-2 h-2 bg-indigo-600 rounded-full"></div><div className="w-2 h-2 bg-indigo-600 rounded-full"></div></div></div>;
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Invoice Generator</h2>
        <p className="text-slate-500 mt-1">Create and export PDF invoices for your clients.</p>
      </div>

      <div className="grid xl:grid-cols-12 gap-8 items-start">
        {/* Left Column - Form */}
        <div className="xl:col-span-5 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Receipt size={18} className="text-indigo-500" />
              Invoice Details
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Select Client *</label>
                <select 
                  className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-500"
                  value={selectedClientId}
                  onChange={handleClientChange}
                >
                  <option value="" disabled>-- Choose a saved client --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {clients.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Please add a client in the Clients tab first.</p>
                )}
              </div>
              
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Date From *</label>
                    <input 
                      type="date"
                      className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-500"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Date To *</label>
                    <input 
                      type="date"
                      className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 outline-none transition-colors focus:border-indigo-500"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400">Automatically loads uninvoiced work within this custom date span.</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Line Items</h3>
              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={() => addItem('', selectedClient ? selectedClient.defaultRate : 0)}
                  className="text-indigo-600 text-xs font-semibold underline hover:text-indigo-700 flex items-center gap-1"
                >
                  <Plus size={14} /> Add Reel
                </button>
                <button 
                  onClick={() => addItem('On Site Shoot', selectedClient?.onSiteShootRate || 0)}
                  className="text-indigo-600 text-xs font-semibold underline hover:text-indigo-700 flex items-center gap-1"
                >
                  <Plus size={14} /> Add On Site Shoot
                </button>
                <button 
                  onClick={() => addItem('Website Making', selectedClient?.websiteMakingRate || 0)}
                  className="text-indigo-600 text-xs font-semibold underline hover:text-indigo-700 flex items-center gap-1"
                >
                  <Plus size={14} /> Add Website
                </button>
              </div>
            </div>
            
            {/* Quick Set Direct Grand Total */}
            <div className="mb-5 p-3.5 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 border border-indigo-100 rounded-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Calculator size={15} className="text-indigo-600" />
                    Direct Grand Total Split
                  </span>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Enter target grand total to divide equally across all {reels.length} item{reels.length === 1 ? '' : 's'}.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">₹</span>
                    <input 
                      type="number" 
                      min="0"
                      placeholder="e.g. 10000"
                      value={directGrandTotalInput}
                      onChange={(e) => setDirectGrandTotalInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyDirectGrandTotal();
                        }
                      }}
                      className="w-32 sm:w-36 pl-7 pr-2 py-1.5 text-sm font-semibold border border-indigo-200 rounded-lg bg-white text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-xs"
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={handleApplyDirectGrandTotal}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs whitespace-nowrap flex items-center gap-1.5"
                    title="Divide grand total into clean whole numbers equally"
                  >
                    <Divide size={13} />
                    Split Equally
                  </button>
                  <button 
                    type="button"
                    onClick={handleRoundFigures}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs whitespace-nowrap flex items-center gap-1.5"
                    title="Round prices to nearest hundred (>150 rounds to 200, <150 rounds to 100)"
                  >
                    <Coins size={13} />
                    Round Figures
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {reels.map((reel, index) => (
                <div key={reel.id} className="p-4 bg-slate-50 rounded border border-slate-100 relative group">
                  {reels.length > 1 && (
                    <button 
                      onClick={() => removeReel(reel.id)}
                      className="absolute -top-2 -right-2 p-1.5 bg-white border border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                      <input 
                        type="text" 
                        value={reel.title}
                        onChange={(e) => updateReel(reel.id, 'title', e.target.value)}
                        placeholder="e.g. Wedding Highlight Reel"
                        className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-white outline-none transition-colors focus:border-indigo-500"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-4">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Quantity</label>
                      <input 
                        type="number" 
                        min="1"
                        value={reel.quantity}
                        onChange={(e) => updateReel(reel.id, 'quantity', Number(e.target.value))}
                        className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-white outline-none transition-colors focus:border-indigo-500"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-4">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Rate (₹)</label>
                      <input 
                        type="number" 
                        min="0"
                        value={reel.rate}
                        onChange={(e) => updateReel(reel.id, 'rate', Number(e.target.value))}
                        className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-white outline-none transition-colors focus:border-indigo-500"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-4 flex flex-col justify-end">
                      <div className="px-3 py-2 bg-white border border-slate-200 rounded text-sm font-medium text-right text-slate-900 bg-slate-100/50">
                        ₹{(reel.quantity * reel.rate).toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Discount / Deduction Fields */}
            <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Discount / Deduction (Optional)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Deduction Description</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Early payment discount"
                    value={discountDescription}
                    onChange={(e) => setDiscountDescription(e.target.value)}
                    className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-white outline-none transition-colors focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Deduction Amount (₹)</label>
                  <input 
                    type="number" 
                    min="0"
                    placeholder="e.g. 1000"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-white outline-none transition-colors focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 space-y-2">
              <div className="flex justify-between items-center text-sm text-slate-500">
                <span>Subtotal</span>
                <span>₹{total.toLocaleString('en-IN')}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between items-center text-sm text-rose-500 font-medium">
                  <span>Deduction ({discountDescription.trim() || 'Discount'})</span>
                  <span>-₹{discount.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-dashed border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Grand Total</span>
                  <button
                    type="button"
                    onClick={handleRoundFigures}
                    className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 shadow-2xs"
                    title="Round item prices to nearest hundred (>150 -> 200, <150 -> 100)"
                  >
                    <Coins size={12} />
                    Round Figures
                  </button>
                </div>
                <span className="text-2xl font-bold text-slate-900">₹{grandTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <button 
              onClick={handleDownload}
              disabled={isGenerating || !selectedClient}
              className="w-full mt-6 flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition-colors shadow-sm"
            >
              {isGenerating ? (
                <>Generating PDF...</>
              ) : (
                <>
                  <Download size={18} />
                  Download PDF Invoice
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column - A4 Preview Wrapper */}
        <div className="xl:col-span-7 overflow-x-auto bg-slate-200 p-8 rounded-xl flex justify-center shadow-inner min-h-[600px] border border-slate-300 relative">
          <div className="absolute top-4 left-4 bg-white/80 backdrop-blur px-3 py-1.5 rounded text-xs font-bold text-slate-500 uppercase tracking-wider shadow-sm z-10">
            Live Preview
          </div>
          
          {/* This wrapper scales the visual preview so it fits on screen without changing actual dimensions for PDF export */}
          <div className="transform scale-[0.4] min-[400px]:scale-[0.45] sm:scale-[0.6] md:scale-[0.8] xl:scale-[0.9] origin-top transition-transform duration-300">
            
            {/* The actual A4 element captured by html2pdf */}
            <div 
              id="invoice-preview-capture" 
              className="bg-white shadow-2xl relative flex flex-col justify-between"
              style={{ 
                width: '210mm', 
                minHeight: '297mm', 
                padding: '16mm 18mm',
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                color: '#0f172a',
                boxSizing: 'border-box'
              }}
            >
              <div>
                {/* Top Accent Strip & Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-8">
                  {/* Left Branding */}
                  <div className="w-2/3 pr-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Logo className="w-10 h-10 rounded-xl shadow-xs" />
                      <div>
                        <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                          {profile?.name || user?.displayName || 'Video Production Studio'}
                        </h1>
                        <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mt-0.5">
                          {profile?.professionalTitle || profile?.servicesDescription || 'Professional Video Editing & Content Creation'}
                        </p>
                      </div>
                    </div>
                    {profile?.phone && (
                      <p className="text-sm font-medium text-slate-600 mt-2 flex items-center gap-1.5">
                        <span className="font-bold text-slate-400 uppercase text-xs tracking-wider">Phone:</span> {profile.phone}
                      </p>
                    )}
                  </div>

                  {/* Right Invoice Title */}
                  <div className="w-1/3 text-right flex flex-col items-end">
                    <h2 className="text-4xl font-black text-slate-900 tracking-tight uppercase">
                      INVOICE
                    </h2>
                    <p className="text-sm font-mono font-bold text-slate-600 mt-1">
                      #INV-{String(invoices.length + 1).padStart(4, '0')}
                    </p>
                  </div>
                </div>

                {/* Billed To & Invoice Metadata Cards */}
                <div className="grid grid-cols-2 gap-6 mb-8">
                  {/* Billed To Card */}
                  <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-5 shadow-2xs">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-2">
                      Billed To
                    </span>
                    {selectedClient ? (
                      <div>
                        <p className="font-black text-xl text-slate-900 mb-1">{selectedClient.name}</p>
                        {selectedClient.phone && (
                          <p className="text-sm text-slate-600 font-medium">Ph: {selectedClient.phone}</p>
                        )}
                        {selectedClient.email && (
                          <p className="text-sm text-slate-600 font-medium truncate">Email: {selectedClient.email}</p>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400 italic">
                        Select a client to preview invoice details
                      </div>
                    )}
                  </div>

                  {/* Invoice Summary Card */}
                  <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-5 shadow-2xs flex flex-col justify-between">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-2">
                        Invoice Overview
                      </span>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 font-medium">Issue Date:</span>
                          <span className="font-bold text-slate-900">
                            {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        {dateFrom && dateTo && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 font-medium">Billing Period:</span>
                            <span className="font-semibold text-slate-800 text-xs">
                              {new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – {new Date(dateTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 font-medium">Last Payment Date:</span>
                          <span className="font-semibold text-slate-800">
                            {selectedClient?.lastPaymentDate 
                              ? new Date(selectedClient.lastPaymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) 
                              : 'N/A (First Cycle)'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="mb-8">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white rounded-lg">
                        <th className="py-3 px-3 font-bold text-xs uppercase tracking-wider text-slate-200 rounded-l-lg w-12 text-center">#</th>
                        <th className="py-3 px-3 font-bold text-xs uppercase tracking-wider text-slate-200">Item Description</th>
                        <th className="py-3 px-3 font-bold text-xs uppercase tracking-wider text-slate-200 text-center w-20">Qty</th>
                        <th className="py-3 px-3 font-bold text-xs uppercase tracking-wider text-slate-200 text-right w-32">Rate</th>
                        <th className="py-3 px-3 font-bold text-xs uppercase tracking-wider text-slate-200 text-right rounded-r-lg w-36">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {reels.map((reel, idx) => (
                        <tr key={reel.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-3 text-sm font-semibold text-slate-400 text-center">
                            {String(idx + 1).padStart(2, '0')}
                          </td>
                          <td className="py-4 px-3 text-base font-semibold text-slate-900">
                            {reel.title || <span className="text-slate-400 italic font-normal">Item description...</span>}
                          </td>
                          <td className="py-4 px-3 text-base text-center font-medium text-slate-700">
                            {reel.quantity}
                          </td>
                          <td className="py-4 px-3 text-base text-right font-medium text-slate-700">
                            ₹{reel.rate.toLocaleString('en-IN')}
                          </td>
                          <td className="py-4 px-3 text-base text-right font-bold text-slate-900">
                            ₹{(reel.quantity * reel.rate).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals Section */}
                <div className="flex justify-end mb-10 avoid-break" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  <div className="w-72 sm:w-80 space-y-2">
                    <div className="flex justify-between items-center py-1.5 px-3 text-sm text-slate-600">
                      <span className="font-semibold uppercase tracking-wider text-xs text-slate-500">Subtotal</span>
                      <span className="font-bold text-slate-900">₹{total.toLocaleString('en-IN')}</span>
                    </div>

                    {discount > 0 && (
                      <div className="flex justify-between items-center py-1.5 px-3 text-sm text-rose-600 font-medium bg-rose-50/60 rounded-lg border border-rose-100">
                        <span className="font-semibold uppercase tracking-wider text-xs text-rose-600">
                          Deduction {discountDescription ? `(${discountDescription})` : ''}
                        </span>
                        <span className="font-bold">-₹{discount.toLocaleString('en-IN')}</span>
                      </div>
                    )}

                    <div className="bg-slate-900 text-white p-4 rounded-xl shadow-md flex justify-between items-center mt-2">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-widest text-indigo-300 block">Total Due</span>
                        <span className="text-[10px] text-slate-400 font-medium">Payable via UPI / Bank</span>
                      </div>
                      <span className="text-2xl font-black text-white tracking-tight">₹{grandTotal.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Details & QR Code Footer Section */}
              <div className="border-t-2 border-slate-900 pt-6 mt-6 avoid-break" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <div className="grid grid-cols-12 gap-6 items-start">
                  {/* Left Column: Bank & UPI Info */}
                  <div className="col-span-8 space-y-3">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-900 block">
                      Payment Information
                    </span>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-800 bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase block">Payment Method</span>
                        <span className="font-semibold text-slate-900">UPI Transfer</span>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase block">UPI ID</span>
                        <span className="font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded text-xs inline-block mt-0.5">
                          {profile?.upiId || 'Not specified'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase block">Payee Name</span>
                        <span className="font-semibold text-slate-900">{profile?.name || user?.displayName || 'Video Editor'}</span>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase block">Payment Cycle</span>
                        <span className="font-semibold text-slate-800">
                          {selectedClient?.lastPaymentDate 
                            ? new Date(selectedClient.lastPaymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) 
                            : 'N/A (First Cycle)'}
                        </span>
                      </div>
                      {profile?.accountNumber && (
                        <>
                          <div>
                            <span className="text-[11px] font-bold text-slate-400 uppercase block">Bank Account No</span>
                            <span className="font-mono font-semibold text-slate-900">{profile.accountNumber}</span>
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-slate-400 uppercase block">IFSC / Bank</span>
                            <span className="font-semibold text-slate-900">{profile.ifscCode || ''} {profile.bankName ? `(${profile.bankName})` : ''}</span>
                          </div>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 italic mt-2">
                      Thank you for your business! Please process payment within 7 days of receiving this invoice.
                    </p>
                  </div>

                  {/* Right Column: QR Code */}
                  <div className="col-span-4 flex flex-col items-center justify-center">
                    <div className="bg-white p-3 border-2 border-slate-200 rounded-2xl shadow-sm flex flex-col items-center">
                      {qrCodeUrl ? (
                        <img 
                          src={qrCodeUrl} 
                          alt="UPI QR Code" 
                          className="w-32 h-32 rounded-lg"
                        />
                      ) : (
                        <div className="w-32 h-32 flex items-center justify-center text-slate-300 text-xs italic">
                          Generating QR...
                        </div>
                      )}
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-2">
                        Scan with GPay / PhonePe / Paytm
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Signature & Verification Note */}
                <div className="mt-6 pt-3 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400 font-medium">
                  <span>This is a computer-generated invoice statement.</span>
                  <span>Generated on {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice History & Email Actions Section */}
      <div className="mt-12 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Receipt size={20} className="text-indigo-600" />
              Invoice History & Email Dispatch
            </h3>
            <p className="text-xs text-slate-500">
              View generated cycle invoices and resend email notifications with itemized work details.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Local Invoice Search Bar */}
            <div className="relative w-full md:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={invoiceSearchQuery}
                onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                placeholder="Filter invoices or client..."
                className="w-full bg-slate-50 text-xs pl-8 pr-7 py-1.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
              />
              {invoiceSearchQuery && (
                <button
                  onClick={() => setInvoiceSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200 shrink-0">
              {invoices.length} Invoices
            </span>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="py-12 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-400 space-y-1">
            <p className="text-xs font-semibold text-slate-600">No invoices generated yet</p>
            <p className="text-[11px]">Select a client above and click "Download PDF Invoice" to generate an invoice & send email.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="p-3.5">Invoice No / Date</th>
                  <th className="p-3.5">Client</th>
                  <th className="p-3.5">Items / Summary</th>
                  <th className="p-3.5 text-right">Total Amount</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right">Email Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {invoices
                  .filter(inv => {
                    if (!invoiceSearchQuery.trim()) return true;
                    const q = invoiceSearchQuery.toLowerCase().trim();
                    const invNo = inv.id.substring(0, 8).toLowerCase();
                    const itemsText = inv.reels ? inv.reels.map(r => r.title).join(' ').toLowerCase() : '';
                    return inv.clientName.toLowerCase().includes(q) ||
                      invNo.includes(q) ||
                      itemsText.includes(q);
                  })
                  .slice()
                  .sort((a, b) => b.date - a.date)
                  .map((inv) => {
                  const clientObj = clients.find(c => c.id === inv.clientId) || {
                    id: inv.clientId,
                    name: inv.clientName,
                    email: '',
                    phone: '',
                    defaultRate: 0,
                    createdAt: 0
                  };

                  const emailDetails = generateInvoiceEmailDetails(clientObj, inv, profile);

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3.5 font-mono text-xs text-slate-700">
                        <div className="font-bold text-slate-900">#{inv.id.substring(0, 8).toUpperCase()}</div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </td>
                      <td className="p-3.5 font-medium text-slate-900">
                        <div>{inv.clientName}</div>
                        {clientObj.email && (
                          <div className="text-[11px] text-slate-400 font-normal">{clientObj.email}</div>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-600">
                        <div className="font-semibold text-xs text-slate-800">{inv.reels.length} item(s)</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">
                          {inv.reels.map(r => r.title).join(', ')}
                        </div>
                      </td>
                      <td className="p-3.5 text-right font-bold text-slate-900">
                        ₹{inv.totalAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={async () => {
                            const newStatus = inv.status === 'Paid' ? 'Pending' : 'Paid';
                            await addInvoice({ ...inv, status: newStatus });
                            if (newStatus === 'Paid' && clientObj.id) {
                              const pDate = inv.date || Date.now();
                              await updateClient({ ...clientObj, lastPaymentDate: pDate });
                            }
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border cursor-pointer transition-transform hover:scale-105 ${
                            inv.status === 'Paid'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          }`}
                          title={`Click to mark as ${inv.status === 'Paid' ? 'Pending' : 'Paid & update last payment date'}`}
                        >
                          {inv.status}
                        </button>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={async () => {
                              const pdfFilename = `Invoice_${clientObj.name.replace(/\s+/g, '_')}_${inv.id.substring(0, 8)}.pdf`;
                              let pdfBlob: Blob | undefined = undefined;
                              try {
                                pdfBlob = await generateOffscreenPdfBlob({
                                  invoice: inv,
                                  client: clientObj,
                                  profile
                                });
                              } catch (e) {
                                console.warn("Could not pre-generate PDF blob for history invoice:", e);
                              }

                              setEmailModalData({
                                isOpen: true,
                                clientName: inv.clientName,
                                clientEmail: clientObj.email || '',
                                subject: emailDetails.subject,
                                body: emailDetails.body,
                                mailtoLink: emailDetails.mailtoLink,
                                monthCycleStr: emailDetails.monthCycleStr,
                                invoiceNo: inv.id.substring(0, 8).toUpperCase(),
                                totalAmount: inv.totalAmount,
                                pdfFilename: pdfFilename,
                                pdfBlob: pdfBlob,
                                invoiceObj: inv,
                                clientObj: clientObj,
                                gmailStatus: { sending: false }
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
                            title="Send Invoice PDF via Gmail"
                          >
                            <Mail size={13} /> Send via Gmail
                          </button>

                          <a
                            href={emailDetails.mailtoLink}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                            title="Open Default Mail App"
                          >
                            <Send size={13} />
                          </a>

                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`Subject: ${emailDetails.subject}\n\n${emailDetails.body}`);
                              alert(`Invoice email details for ${inv.clientName} copied to clipboard!`);
                            }}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                            title="Copy Email Text to Clipboard"
                          >
                            <Copy size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Email Sent / Prepared Modal */}
      {emailModalData && emailModalData.isOpen && (
        <div 
          onClick={() => setEmailModalData(null)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-8 max-h-[90vh] overflow-y-auto cursor-default"
          >
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-100 text-indigo-700 rounded-xl">
                  <MailCheck size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    Invoice Email & Gmail Delivery for {emailModalData.clientName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cycle: <span className="font-semibold text-slate-700">{emailModalData.monthCycleStr}</span> • Amount: <span className="font-bold text-emerald-600">₹{emailModalData.totalAmount.toLocaleString('en-IN')}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setEmailModalData(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Gmail Live Status Banner */}
            {emailModalData.gmailStatus?.sending ? (
              <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-center gap-2.5 font-medium">
                <Loader2 size={16} className="animate-spin text-indigo-600 shrink-0" />
                <span>Sending Invoice PDF directly to <strong>{emailModalData.clientEmail || 'client'}</strong> via Gmail API...</span>
              </div>
            ) : emailModalData.gmailStatus?.success ? (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="text-emerald-600 w-5 h-5 shrink-0" />
                  <div>
                    <p className="font-bold">Invoice PDF successfully sent via Gmail!</p>
                    <p className="text-[11px] text-emerald-700">Delivered to <strong>{emailModalData.clientEmail}</strong> with PDF attached.</p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-mono font-bold px-2 py-0.5 rounded">Gmail API</span>
              </div>
            ) : (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-amber-900 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" /> Gmail Automatic Delivery Status:
                  </p>
                  {emailModalData.gmailStatus?.error && (
                    <span className="text-[10px] text-rose-600 font-mono font-semibold max-w-xs truncate" title={emailModalData.gmailStatus.error}>
                      {emailModalData.gmailStatus.error}
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  {emailModalData.clientEmail 
                    ? "Click 'Send Invoice PDF via Gmail' below to authorize Gmail and send the attached PDF directly to your client." 
                    : "Please enter your client's email address below, then click 'Send Invoice PDF via Gmail'."}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Client Email Address *</label>
                  <input
                    type="email"
                    value={emailModalData.clientEmail}
                    onChange={e => setEmailModalData({ ...emailModalData, clientEmail: e.target.value })}
                    placeholder="client@example.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>

                {emailModalData.pdfFilename && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                      <span>Attached Document</span>
                      <span className="text-[10px] text-emerald-600 font-semibold">✓ Included in Gmail Send</span>
                    </label>
                    <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-between text-xs font-mono text-slate-700 h-[38px]">
                      <div className="flex items-center gap-1.5 truncate pr-2">
                        <FileText size={14} className="text-rose-500 shrink-0" />
                        <span className="truncate">{emailModalData.pdfFilename}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {emailModalData.pdfBlob && (
                          <button
                            type="button"
                            onClick={() => {
                              if (emailModalData.pdfBlob) {
                                const url = URL.createObjectURL(emailModalData.pdfBlob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = emailModalData.pdfFilename || 'Invoice.pdf';
                                a.click();
                                URL.revokeObjectURL(url);
                              }
                            }}
                            className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-sans text-[11px] font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer"
                            title="Download Invoice PDF file"
                          >
                            <Download size={12} className="text-indigo-600" /> Save PDF
                          </button>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 bg-rose-50 text-rose-700 font-semibold rounded">
                          PDF
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Email Subject</label>
                <input
                  type="text"
                  value={emailModalData.subject}
                  onChange={e => setEmailModalData({ ...emailModalData, subject: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Email Message Body</label>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`Subject: ${emailModalData.subject}\n\n${emailModalData.body}`);
                      alert("Invoice email content copied to clipboard!");
                    }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                  >
                    <Copy size={12} /> Copy Text
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={emailModalData.body}
                  onChange={e => setEmailModalData({ ...emailModalData, body: e.target.value })}
                  className="w-full p-3.5 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono leading-relaxed outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <span className="text-xs text-slate-400">
                Target: <strong className="text-slate-700">{emailModalData.clientEmail || 'No email entered'}</strong>
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setEmailModalData(null)}
                  className="flex-1 sm:flex-none px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Close
                </button>

                <a
                  href={emailModalData.mailtoLink}
                  className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Open Default Mail App"
                >
                  <Send size={15} />
                </a>

                <button
                  type="button"
                  onClick={handleSendGmailManual}
                  disabled={isSendingGmail || emailModalData.gmailStatus?.sending}
                  className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs flex items-center justify-center gap-2"
                >
                  {isSendingGmail || emailModalData.gmailStatus?.sending ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Sending via Gmail...
                    </>
                  ) : (
                    <>
                      <Mail size={14} />
                      Send Invoice PDF via Gmail
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
