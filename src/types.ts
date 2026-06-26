export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  defaultRate: number;
  onSiteShootRate?: number;
  websiteMakingRate?: number;
  createdAt: number;
}

export interface Reel {
  id: string;
  title: string;
  quantity: number;
  rate: number;
}

export interface Invoice {
  id: string;
  date: number;
  clientId: string;
  clientName: string;
  reels: Reel[];
  totalAmount: number;
  status: 'Pending' | 'Paid';
}
