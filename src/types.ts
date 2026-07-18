/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  imageUrl: string;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface TrackingStep {
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  description: string;
  timestamp: string;
}

export interface Order {
  id: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  paymentMethod: 'airtel' | 'orange' | 'mpesa' | 'cash';
  paymentTxRef?: string;
  createdAt: string;
  deliveredAt?: string;
  trackingSteps: TrackingStep[];
}

export interface ShopSettings {
  adminEmail: string;
  adminPhones?: string;
  airtelMoney: string;
  orangeMoney: string;
  mpesa: string;
  address: string;
  slogan: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  exchangeRate?: number;
}

export interface PhoneUser {
  phoneNumber: string;
  role: 'manager' | 'client';
}
