import { Client, Invoice, WorkItem } from '../types';

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

export function generateWhatsAppReminder(client: Client, statusInfo: PaymentStatusInfo): string {
  const dueDateStr = new Date(statusInfo.nextDueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const pendingAmountStr = statusInfo.totalPendingAmount > 0 
    ? `Amount due: ₹${statusInfo.totalPendingAmount.toLocaleString('en-IN')}\n`
    : '';

  let message = `Hi ${client.name},\n\nHope you are doing well!\n\nThis is a friendly reminder regarding your video editing service cycle ending on ${dueDateStr}.\n${pendingAmountStr}\nKindly request you to clear the payment at your earliest convenience.\n\nThank you!\nTilak Popat`;

  if (statusInfo.daysRemaining < 0) {
    message = `Hi ${client.name},\n\nHope you are doing well!\n\nThis is a follow-up regarding the payment due on ${dueDateStr} (${Math.abs(statusInfo.daysRemaining)} days delayed).\n${pendingAmountStr}\nPlease share the transaction update once done.\n\nThank you!\nTilak Popat`;
  }

  return `https://wa.me/${client.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;
}
