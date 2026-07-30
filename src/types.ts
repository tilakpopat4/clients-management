export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  defaultRate: number;
  onSiteShootRate?: number;
  websiteMakingRate?: number;
  lastPaymentDate?: number; // timestamp in ms of previous payment date
  paymentCycleDays?: number; // default 30 days
  emailRemindersEnabled?: boolean; // toggle for overdue payment email reminders
  notes?: string;
  createdAt: number;
}

export interface Reel {
  id: string;
  title: string;
  quantity: number;
  rate: number;
}

export interface WorkItem {
  id: string;
  clientId: string;
  description: string;
  quantity: number;
  rate: number;
  date: number;
  status: 'Uninvoiced' | 'Invoiced';
  invoiceId?: string;
  createdAt: number;
}

export interface Invoice {
  id: string;
  date: number;
  clientId: string;
  clientName: string;
  reels: Reel[];
  totalAmount: number;
  status: 'Pending' | 'Paid';
  discountAmount?: number;
  discountDescription?: string;
  lastPaymentDate?: number;
}

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  upiId: string;
  professionalTitle: string;
  servicesDescription: string;
  accountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  createdAt: number;
}

export interface StickyNote {
  id: string;
  clientId: string; // client ID, or 'general' / '' for general notes
  content: string;
  color: 'yellow' | 'blue' | 'green' | 'pink' | 'purple';
  createdAt: number;
  updatedAt?: number;
  userId?: string;
}

