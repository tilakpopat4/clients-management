import { Client, Invoice, WorkItem, UserProfile } from '../types';

export interface PaymentStatusInfo {
  nextDueDate: number; // timestamp in ms
  daysRemaining: number; // integer days from today
  code: 'UP_TO_DATE' | 'DUE_IN_3_DAYS' | 'DUE_IN_1_DAY' | 'DUE_TODAY' | 'OVERDUE_2_DAYS' | 'OVERDUE';
  label: string;
  badgeClass: string;
  isNotificationRequired: boolean;
  notificationTitle: string;
  notificationMessage: string;
  severity: 'ok' | 'warning' | 'urgent' | 'critical' | 'delayed';
  totalPendingAmount: number;
}

export function getNextPaymentDueDate(client: Client): number {
  const baseDate = client.lastPaymentDate || client.createdAt || Date.now();
  const cycleDays = client.paymentCycleDays || 30;
  return baseDate + cycleDays * 24 * 60 * 60 * 1000;
}

export function calculateClientFinancials(clientId: string, invoices: Invoice[], workItems: WorkItem[]) {
  // Pending invoices
  const pendingInvoices = invoices.filter(inv => inv.clientId === clientId && inv.status === 'Pending');
  const pendingInvoiceTotal = pendingInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

  // Uninvoiced work items
  const uninvoicedWork = workItems.filter(item => item.clientId === clientId && item.status === 'Uninvoiced');
  const uninvoicedWorkTotal = uninvoicedWork.reduce((sum, item) => sum + (item.quantity * item.rate), 0);

  // Total paid invoices
  const paidInvoices = invoices.filter(inv => inv.clientId === clientId && inv.status === 'Paid');
  const paidTotal = paidInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

  return {
    pendingInvoiceTotal,
    uninvoicedWorkTotal,
    totalPendingAmount: pendingInvoiceTotal + uninvoicedWorkTotal,
    paidTotal,
    pendingInvoices,
    uninvoicedWork,
    paidInvoices
  };
}

export function getPaymentStatusInfo(
  client: Client,
  invoices: Invoice[] = [],
  workItems: WorkItem[] = []
): PaymentStatusInfo {
  const nextDueDate = getNextPaymentDueDate(client);
  
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  const dueDateObj = new Date(nextDueDate);
  const dueMidnight = new Date(dueDateObj.getFullYear(), dueDateObj.getMonth(), dueDateObj.getDate()).getTime();
  
  const daysRemaining = Math.round((dueMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
  
  const financials = calculateClientFinancials(client.id, invoices, workItems);
  const totalPendingAmount = financials.totalPendingAmount;

  let code: PaymentStatusInfo['code'] = 'UP_TO_DATE';
  let label = `Due in ${daysRemaining} days`;
  let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  let isNotificationRequired = false;
  let notificationTitle = '';
  let notificationMessage = '';
  let severity: PaymentStatusInfo['severity'] = 'ok';

  if (daysRemaining === 3) {
    code = 'DUE_IN_3_DAYS';
    label = 'Payment Due in 3 Days';
    badgeClass = 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse';
    isNotificationRequired = true;
    severity = 'warning';
    notificationTitle = `Payment Due in 3 Days: ${client.name}`;
    notificationMessage = `Next monthly cycle payment is due on ${new Date(nextDueDate).toLocaleDateString('en-IN')}.${totalPendingAmount > 0 ? ` Pending amount: ₹${totalPendingAmount.toLocaleString('en-IN')}` : ''}`;
  } else if (daysRemaining === 2 || daysRemaining === 1) {
    code = 'DUE_IN_1_DAY';
    label = daysRemaining === 1 ? 'Payment Due Tomorrow!' : 'Payment Due in 2 Days';
    badgeClass = 'bg-orange-50 text-orange-700 border-orange-200 animate-pulse';
    isNotificationRequired = true;
    severity = 'urgent';
    notificationTitle = `Payment Due ${daysRemaining === 1 ? 'Tomorrow' : 'in 2 Days'}: ${client.name}`;
    notificationMessage = `Payment cycle due date is ${new Date(nextDueDate).toLocaleDateString('en-IN')}.${totalPendingAmount > 0 ? ` Outstanding balance: ₹${totalPendingAmount.toLocaleString('en-IN')}` : ''}`;
  } else if (daysRemaining === 0) {
    code = 'DUE_TODAY';
    label = 'Payment DUE TODAY!';
    badgeClass = 'bg-red-100 text-red-800 border-red-300 font-bold animate-bounce';
    isNotificationRequired = true;
    severity = 'critical';
    notificationTitle = `Payment DUE TODAY: ${client.name}`;
    notificationMessage = `Today (${new Date(nextDueDate).toLocaleDateString('en-IN')}) is the payment due date for ${client.name}. Please collect payment and update payment date.`;
  } else if (daysRemaining === -2) {
    code = 'OVERDUE_2_DAYS';
    label = 'Delayed Notification (2nd Day Overdue)';
    badgeClass = 'bg-purple-100 text-purple-800 border-purple-300 font-bold animate-pulse';
    isNotificationRequired = true;
    severity = 'delayed';
    notificationTitle = `Delayed Payment (Day 2 Overdue): ${client.name}`;
    notificationMessage = `Payment for ${client.name} is delayed by 2 days past the due date (${new Date(nextDueDate).toLocaleDateString('en-IN')}).`;
  } else if (daysRemaining < 0) {
    code = 'OVERDUE';
    const overdueDays = Math.abs(daysRemaining);
    label = `Delayed (${overdueDays} Days Overdue)`;
    badgeClass = 'bg-rose-100 text-rose-800 border-rose-300 font-semibold';
    isNotificationRequired = overdueDays >= 2;
    severity = 'delayed';
    notificationTitle = `Payment Overdue (${overdueDays} Days): ${client.name}`;
    notificationMessage = `Payment was due on ${new Date(nextDueDate).toLocaleDateString('en-IN')}. Please follow up on payment.`;
  } else if (daysRemaining > 3) {
    code = 'UP_TO_DATE';
    label = `Next Due: ${new Date(nextDueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} (${daysRemaining}d)`;
    badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
    isNotificationRequired = false;
    severity = 'ok';
  }

  return {
    nextDueDate,
    daysRemaining,
    code,
    label,
    badgeClass,
    isNotificationRequired,
    notificationTitle,
    notificationMessage,
    severity,
    totalPendingAmount
  };
}

export function generateWhatsAppReminder(client: Client, statusInfo: PaymentStatusInfo, senderName: string = 'Video Editor'): string {
  const dueDateStr = new Date(statusInfo.nextDueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const pendingAmountStr = statusInfo.totalPendingAmount > 0 
    ? `Amount due: ₹${statusInfo.totalPendingAmount.toLocaleString('en-IN')}\n`
    : '';

  let message = `Hi ${client.name},\n\nHope you are doing well!\n\nThis is a friendly reminder regarding your video editing service cycle ending on ${dueDateStr}.\n${pendingAmountStr}\nKindly request you to clear the payment at your earliest convenience.\n\nThank you!\n${senderName}`;

  if (statusInfo.daysRemaining < 0) {
    message = `Hi ${client.name},\n\nHope you are doing well!\n\nThis is a follow-up regarding the payment due on ${dueDateStr} (${Math.abs(statusInfo.daysRemaining)} days delayed).\n${pendingAmountStr}\nPlease share the transaction update once done.\n\nThank you!\n${senderName}`;
  }

  return `https://wa.me/${client.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;
}

export function generateEmailReminder(client: Client, statusInfo: PaymentStatusInfo, senderName: string = 'Video Editor') {
  const dueDateStr = new Date(statusInfo.nextDueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const pendingAmountStr = statusInfo.totalPendingAmount > 0
    ? `Pending Amount: ₹${statusInfo.totalPendingAmount.toLocaleString('en-IN')}`
    : 'Pending Monthly Invoice Payment';

  const isOverdue = statusInfo.daysRemaining < 0;
  const overdueDays = Math.abs(statusInfo.daysRemaining);

  const subject = isOverdue
    ? `[Payment Overdue Notice] ${client.name} - ${pendingAmountStr}`
    : `[Friendly Payment Reminder] ${client.name} - Payment Cycle Due ${dueDateStr}`;

  let body = `Dear ${client.name},\n\n`;

  if (isOverdue) {
    body += `This is an email reminder regarding your video production and editing service payment that was due on ${dueDateStr} (${overdueDays} day${overdueDays > 1 ? 's' : ''} overdue).\n\n`;
    if (statusInfo.totalPendingAmount > 0) {
      body += `Outstanding Total: ₹${statusInfo.totalPendingAmount.toLocaleString('en-IN')}\n\n`;
    }
    body += `Kindly arrange for the payment to be processed at your earliest convenience. If you have already completed the transaction, please disregard this note or reply with the payment confirmation.\n\n`;
  } else {
    body += `This is a friendly reminder that your monthly video production payment cycle due date is ${dueDateStr}.\n\n`;
    if (statusInfo.totalPendingAmount > 0) {
      body += `Current Pending Amount: ₹${statusInfo.totalPendingAmount.toLocaleString('en-IN')}\n\n`;
    }
    body += `Please ensure payment is settled by the due date.\n\n`;
  }

  body += `Thank you for your continued partnership!\n\nBest regards,\n${senderName}`;

  const mailtoLink = client.email 
    ? `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return { subject, body, mailtoLink };
}

export async function triggerBrowserOverdueAlert(clientName: string, statusLabel: string, message: string) {
  // Check Web Notification API support
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(`Overdue Payment Alert: ${clientName}`, {
        body: `${statusLabel} - ${message}`,
        icon: '/app_logo_icon.png'
      });
      return true;
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification(`Overdue Payment Alert: ${clientName}`, {
          body: `${statusLabel} - ${message}`,
          icon: '/app_logo_icon.png'
        });
        return true;
      }
    }
  }

  // Fallback to standard browser alert modal
  alert(`🚨 OVERDUE PAYMENT ALERT 🚨\n\nClient: ${clientName}\nStatus: ${statusLabel}\n\nDetails: ${message}`);
  return false;
}

export function generateInvoiceEmailDetails(
  client: Client,
  invoice: {
    id: string;
    date: number;
    reels: Array<{ title: string; quantity: number; rate: number }>;
    totalAmount: number;
    discountAmount?: number;
    discountDescription?: string;
  },
  profile: UserProfile | null,
  dateFrom?: string,
  dateTo?: string
) {
  const invoiceDateStr = new Date(invoice.date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const monthCycleStr = dateFrom && dateTo 
    ? `${new Date(dateFrom).toLocaleDateString('en-IN', { month: 'short', day: '2-digit' })} - ${new Date(dateTo).toLocaleDateString('en-IN', { month: 'short', day: '2-digit', year: 'numeric' })}`
    : new Date(invoice.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const senderName = profile?.name || 'Video Editor';
  const upiId = profile?.upiId || '';

  const invoiceNo = `INV-${invoice.id.substring(0, 8).toUpperCase()}`;
  const subject = `Invoice ${invoiceNo} - ${client.name} (${monthCycleStr})`;

  let body = `Dear ${client.name},\n\n`;
  body += `Please find below the detailed invoice breakdown for your video production & editing services cycle (${monthCycleStr}).\n\n`;
  body += `========================================\n`;
  body += `INVOICE SUMMARY:\n`;
  body += `========================================\n`;
  body += `Invoice No: ${invoiceNo}\n`;
  body += `Date: ${invoiceDateStr}\n`;
  body += `Billing Cycle Period: ${monthCycleStr}\n`;
  body += `Client Name: ${client.name}\n\n`;

  body += `ITEMIZED WORK BREAKDOWN:\n`;
  body += `----------------------------------------\n`;
  invoice.reels.forEach((reel, idx) => {
    const itemTotal = reel.quantity * reel.rate;
    body += `${idx + 1}. ${reel.title || 'Video Editing Services'}\n`;
    body += `   Quantity: ${reel.quantity} | Rate: ₹${reel.rate.toLocaleString('en-IN')} | Total: ₹${itemTotal.toLocaleString('en-IN')}\n\n`;
  });

  const subtotal = invoice.reels.reduce((sum, r) => sum + (r.quantity * r.rate), 0);
  body += `----------------------------------------\n`;
  body += `Subtotal: ₹${subtotal.toLocaleString('en-IN')}\n`;

  if (invoice.discountAmount && invoice.discountAmount > 0) {
    body += `Deduction (${invoice.discountDescription || 'Discount'}): -₹${invoice.discountAmount.toLocaleString('en-IN')}\n`;
  }

  body += `TOTAL PAYABLE AMOUNT: ₹${invoice.totalAmount.toLocaleString('en-IN')}\n`;
  body += `========================================\n\n`;

  body += `PAYMENT DETAILS:\n`;
  body += `• Payment Method: UPI Transfer\n`;
  body += `• UPI ID: ${upiId}\n`;
  body += `• Account Holder: ${senderName}\n`;
  if (profile?.accountNumber) {
    body += `• Bank Account No: ${profile.accountNumber}\n`;
    body += `• IFSC Code: ${profile.ifscCode || 'N/A'}\n`;
    body += `• Bank Name: ${profile.bankName || 'N/A'}\n`;
  }
  body += `\nThank you for your business! Please reply or share payment confirmation once processed.\n\nBest regards,\n${senderName}`;

  const mailtoLink = client.email 
    ? `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return { subject, body, mailtoLink, monthCycleStr, invoiceNo };
}

