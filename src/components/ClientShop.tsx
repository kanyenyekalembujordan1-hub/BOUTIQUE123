/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingBag, 
  Trash2, 
  ChevronRight, 
  Plus, 
  Minus, 
  MapPin, 
  FileText, 
  Phone, 
  Clock, 
  Search, 
  Check, 
  CheckCircle2, 
  ArrowRight,
  Sparkles,
  Facebook,
  Instagram,
  Compass,
  ArrowLeft
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { collection, addDoc, getDoc, doc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product, Order, OrderItem, ShopSettings, TrackingStep, PhoneUser } from '../types';

interface ClientShopProps {
  settings: ShopSettings;
  products: Product[];
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  currentUser?: PhoneUser | null;
}

export default function ClientShop({ settings, products, showToast, currentUser }: ClientShopProps) {
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'airtel' | 'orange' | 'mpesa' | 'cash'>('airtel');
  const [paymentTxRef, setPaymentTxRef] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  
  // Pre-fill phone if client is logged in
  useEffect(() => {
    if (currentUser && currentUser.role === 'client') {
      setClientPhone(currentUser.phoneNumber);
    }
  }, [currentUser]);
  
  // Tracking State
  const [trackingId, setTrackingId] = useState('');
  const [trackedOrder, setTrackedOrder] = useState<Order | null>(null);
  const [isSearchingOrder, setIsSearchingOrder] = useState(false);
  const [activeTab, setActiveTab] = useState<'shop' | 'tracking' | 'receipt'>('shop');

  // Search and Category states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Load cart from localStorage
  useEffect(() => {
    const savedCart = localStorage.getItem('boutique_pop_chop_cart');
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {
        console.error('Error parsing cart from localStorage', e);
      }
    }
  }, []);

  // Save cart to localStorage
  const saveCart = (newCart: OrderItem[]) => {
    setCart(newCart);
    localStorage.setItem('boutique_pop_chop_cart', JSON.stringify(newCart));
  };

  const categories = ['All', ...new Set(products.map(p => p.category))];

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          product.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.productId === product.id);
    let newCart: OrderItem[];
    if (existing) {
      newCart = cart.map(item => 
        item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
      );
    } else {
      newCart = [...cart, { productId: product.id, name: product.name, price: product.price, quantity: 1 }];
    }
    saveCart(newCart);
    showToast(`"${product.name}" ajouté au panier`, 'success');
  };

  const updateQuantity = (productId: string, delta: number) => {
    const existing = cart.find(item => item.productId === productId);
    if (!existing) return;
    
    let newCart: OrderItem[];
    if (existing.quantity + delta <= 0) {
      newCart = cart.filter(item => item.productId !== productId);
      const prodName = existing.name;
      showToast(`"${prodName}" retiré du panier`, 'info');
    } else {
      newCart = cart.map(item => 
        item.productId === productId 
          ? { ...item, quantity: item.quantity + delta } 
          : item
      );
    }
    saveCart(newCart);
  };

  const removeFromCart = (productId: string, name: string) => {
    const newCart = cart.filter(item => item.productId !== productId);
    saveCart(newCart);
    showToast(`"${name}" retiré du panier`, 'info');
  };

  const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      showToast('Votre panier est vide', 'error');
      return;
    }
    if (!clientName.trim() || !clientPhone.trim()) {
      showToast('Veuillez remplir votre nom et votre numéro de téléphone', 'error');
      return;
    }

    if (paymentMethod !== 'cash' && !paymentTxRef.trim()) {
      showToast('Veuillez entrer la référence du paiement mobile', 'error');
      return;
    }

    setSubmittingOrder(true);
    try {
      const newOrderData = {
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        clientEmail: clientEmail.trim(),
        items: cart,
        total: cartTotal,
        status: 'pending' as const,
        paymentMethod,
        paymentTxRef: paymentMethod === 'cash' ? 'Payement au guichet / livraison' : paymentTxRef.trim(),
        createdAt: new Date().toISOString(),
        trackingSteps: [
          {
            status: 'pending' as const,
            description: 'Votre commande a été reçue et est en cours de validation par la Boutique POP CHOP.',
            timestamp: new Date().toISOString()
          }
        ]
      };

      const docRef = await addDoc(collection(db, 'orders'), newOrderData);
      
      const newOrder: Order = {
        id: docRef.id,
        ...newOrderData
      };

      setCurrentOrder(newOrder);
      setTrackedOrder(newOrder);
      setTrackingId(docRef.id);
      
      // Clear cart
      saveCart([]);
      setIsCheckoutOpen(false);
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setPaymentTxRef('');
      
      setActiveTab('receipt');
      showToast('Commande validée avec succès !', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'orders');
      showToast('Erreur lors de la validation de la commande', 'error');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const lookupOrder = (id: string) => {
    if (!id.trim()) {
      showToast('Veuillez entrer un numéro de commande valide', 'error');
      return;
    }
    setIsSearchingOrder(true);
    
    // Set up real-time listener for this specific order
    const orderDocRef = doc(db, 'orders', id.trim());
    const unsubscribe = onSnapshot(orderDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setTrackedOrder({ id: snapshot.id, ...data } as Order);
        showToast('Commande trouvée et mise à jour en temps réel', 'success');
      } else {
        setTrackedOrder(null);
        showToast('Aucune commande trouvée avec cet identifiant', 'error');
      }
      setIsSearchingOrder(false);
    }, (error) => {
      console.error("Error looking up order", error);
      setIsSearchingOrder(false);
      showToast('Erreur lors du suivi de la commande', 'error');
    });

    return unsubscribe;
  };

  const getPaymentNumber = () => {
    switch(paymentMethod) {
      case 'airtel': return settings.airtelMoney || '0998283123';
      case 'orange': return settings.orangeMoney || 'Non configuré';
      case 'mpesa': return settings.mpesa || 'Non configuré';
      default: return '';
    }
  };

  const generatePDFInvoice = (order: Order) => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Colors matching Natural Tones
      // Dark Charcoal: 63, 61, 58
      // Terracotta: 193, 92, 61
      // Cream: 244, 239, 230
      
      // Header Banner
      doc.setFillColor(244, 239, 230);
      doc.rect(0, 0, 210, 40, 'F');
      
      doc.setTextColor(193, 92, 61);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("BOUTIQUE POP CHOP", 15, 18);
      
      doc.setTextColor(63, 61, 58);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.text(`"${settings.slogan}"`, 15, 24);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`${settings.address}`, 15, 30);
      doc.text(`Contact Gérant (Airtel): ${settings.airtelMoney || '0998283123'}`, 15, 34);

      // Invoice Details Label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("REÇU DE COMMANDE ET FACTURE", 15, 52);
      
      // Order metadata
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`N° Commande : ${order.id}`, 15, 60);
      doc.text(`Date : ${new Date(order.createdAt).toLocaleString('fr-FR')}`, 15, 66);
      doc.text(`Statut actuel : ${
        order.status === 'pending' ? 'En attente' :
        order.status === 'preparing' ? 'En préparation' :
        order.status === 'ready' ? 'Prêt pour retrait / livraison' :
        order.status === 'delivered' ? 'Livré / Récupéré' : 'Annulé'
      }`, 15, 72);

      // Client info
      doc.setFont("helvetica", "bold");
      doc.text("Informations Client :", 120, 60);
      doc.setFont("helvetica", "normal");
      doc.text(`Nom : ${order.clientName}`, 120, 66);
      doc.text(`Tél : ${order.clientPhone}`, 120, 72);
      if (order.clientEmail) {
        doc.text(`Email : ${order.clientEmail}`, 120, 78);
      }

      // Divider line
      doc.setDrawColor(169, 159, 144);
      doc.setLineWidth(0.5);
      doc.line(15, 84, 195, 84);

      // Table Headers
      doc.setFont("helvetica", "bold");
      doc.text("Article", 15, 92);
      doc.text("Prix unitaire", 100, 92);
      doc.text("Quantité", 140, 92);
      doc.text("Total", 170, 92);

      doc.line(15, 95, 195, 95);

      // Table items
      doc.setFont("helvetica", "normal");
      let y = 102;
      order.items.forEach(item => {
        doc.text(item.name, 15, y);
        doc.text(`${item.price.toLocaleString('fr-FR')} $`, 100, y);
        doc.text(`${item.quantity}`, 140, y);
        doc.text(`${(item.price * item.quantity).toLocaleString('fr-FR')} $`, 170, y);
        y += 8;
      });

      doc.line(15, y - 2, 195, y - 2);

      // Grand Total
      doc.setFont("helvetica", "bold");
      doc.text("MONTANT TOTAL DES ACHATS (SOLDE) :", 85, y + 6);
      doc.setTextColor(193, 92, 61);
      doc.text(`${order.total.toLocaleString('fr-FR')} $`, 170, y + 6);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      const totalFC = order.total * (settings.exchangeRate || 2850);
      doc.text(`Soit : ${totalFC.toLocaleString('fr-FR')} FC (Taux: ${(settings.exchangeRate || 2850).toLocaleString('fr-FR')} FC/$)`, 85, y + 12);

      // Payment Info
      doc.setTextColor(63, 61, 58);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Mode de paiement : ${
        order.paymentMethod === 'airtel' ? 'Airtel Money' :
        order.paymentMethod === 'orange' ? 'Orange Money' :
        order.paymentMethod === 'mpesa' ? 'M-Pesa' : 'Espèces (Cash)'
      }`, 15, y + 22);
      doc.text(`Réf. Transaction : ${order.paymentTxRef || 'N/A'}`, 15, y + 27);

      // Warning / Instructions
      doc.setFillColor(249, 246, 240);
      doc.rect(15, y + 36, 180, 24, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text("CONSIGNE IMPORTANTE POUR LE RETRAIT", 18, y + 42);
      doc.setFont("helvetica", "normal");
      doc.text("Veuillez conserver cette facture. Présentez le QR Code généré en ligne au guichet", 18, y + 48);
      doc.text("de la boutique ou au livreur pour récupérer vos articles en toute sécurité.", 18, y + 53);

      // Add QR Code notice in PDF
      doc.text("QR Code de validation disponible sur la version numérique.", 15, y + 68);

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Merci pour votre confiance ! Boutique POP CHOP - Maria Business Toujours Hmm Bongo Nde", 15, 285);

      doc.save(`Facture_PopChop_${order.id.slice(0,6).toUpperCase()}.pdf`);
      showToast('Facture PDF téléchargée', 'success');
    } catch (e) {
      console.error(e);
      showToast('Échec de la génération du PDF', 'error');
    }
  };

  return (
    <div id="client-shop" className="space-y-8 text-[#2D2926] dark:text-[#EFEDE9]">
      {/* Navigation bar for Client */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#2D2926]/10 dark:border-white/10 pb-4">
        <div>
          <h2 className="text-2xl font-serif italic text-[#2D2926] dark:text-white flex items-center gap-2">
            <Compass className="w-6 h-6 text-[#FF6321]" />
            Espace Client Boutique
          </h2>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#2D2926]/60 dark:text-[#EFEDE9]/60 mt-1">Explorez notre collection et suivez vos achats en temps réel</p>
        </div>
        
        <div className="flex bg-[#EFEDE9] dark:bg-[#201D1A] p-1 border border-[#2D2926]/10 dark:border-white/10">
          <button 
            onClick={() => setActiveTab('shop')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border ${activeTab === 'shop' ? 'bg-[#2D2926] dark:bg-[#EFEDE9] border-[#2D2926] dark:border-[#EFEDE9] text-white dark:text-[#2D2926]' : 'text-[#2D2926] dark:text-[#EFEDE9] border-transparent hover:bg-[#2D2926]/5 dark:hover:bg-white/5'}`}
          >
            Boutique
          </button>
          <button 
            onClick={() => setActiveTab('tracking')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border ${activeTab === 'tracking' ? 'bg-[#2D2926] dark:bg-[#EFEDE9] border-[#2D2926] dark:border-[#EFEDE9] text-white dark:text-[#2D2926]' : 'text-[#2D2926] dark:text-[#EFEDE9] border-transparent hover:bg-[#2D2926]/5 dark:hover:bg-white/5'}`}
          >
            Suivi Commande
          </button>
          {currentOrder && (
            <button 
              onClick={() => setActiveTab('receipt')}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border ${activeTab === 'receipt' ? 'bg-[#2D2926] dark:bg-[#EFEDE9] border-[#2D2926] dark:border-[#EFEDE9] text-white dark:text-[#2D2926]' : 'text-[#2D2926] dark:text-[#EFEDE9] border-transparent hover:bg-[#2D2926]/5 dark:hover:bg-white/5'}`}
            >
              Dernier Reçu
            </button>
          )}
        </div>
      </div>

      {/* SHOP VIEW */}
      {activeTab === 'shop' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* CATALOGUE SECTION (2 COLS) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Search and Category Filters */}
            <div className="bg-white dark:bg-[#201D1A] p-5 border border-[#2D2926]/10 dark:border-white/10 shadow-sm space-y-4">
              <div className="relative">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#2D2926]/50 dark:text-[#EFEDE9]/50" />
                <input
                  type="text"
                  placeholder="Rechercher un vêtement, accessoire..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#EFEDE9]/30 dark:bg-[#26211E]/50 border border-[#2D2926]/10 dark:border-white/10 text-xs font-semibold tracking-wider text-[#2D2926] dark:text-[#EFEDE9] focus:outline-none focus:border-[#FF6321] focus:bg-white dark:focus:bg-[#26211E] transition-all"
                />
              </div>

              {/* Categories */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-3 py-1.5 text-[9px] uppercase tracking-widest font-black transition-colors cursor-pointer border ${
                      selectedCategory === category 
                        ? 'bg-[#FF6321] border-[#FF6321] text-white' 
                        : 'bg-[#EFEDE9]/40 dark:bg-[#26211E]/40 border-[#2D2926]/10 dark:border-white/10 text-[#2D2926]/70 dark:text-[#EFEDE9]/70 hover:bg-[#EFEDE9] dark:hover:bg-[#26211E] hover:text-[#2D2926] dark:hover:text-[#EFEDE9]'
                    }`}
                  >
                    {category === 'All' ? 'Tous les produits' : category}
                  </button>
                ))}
              </div>
            </div>

            {/* Products Grid */}
            {filteredProducts.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-[#201D1A] border border-[#2D2926]/10 dark:border-white/10">
                <ShoppingBag className="w-12 h-12 text-[#FF6321] mx-auto opacity-30 mb-4 stroke-[1.25]" />
                <p className="text-[#2D2926] dark:text-[#EFEDE9] font-bold uppercase tracking-wider text-sm">Aucun article trouvé</p>
                <p className="text-[11px] text-[#2D2926]/60 dark:text-[#EFEDE9]/60 mt-1 uppercase tracking-widest">Essayez d'autres termes ou une autre catégorie</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {filteredProducts.map((product) => (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-[#201D1A] border border-[#2D2926]/10 dark:border-white/10 hover:border-[#2D2926]/30 dark:hover:border-white/30 transition-all flex flex-col group p-3"
                  >
                    <div className="h-56 w-full bg-[#EFEDE9] dark:bg-[#26211E] relative overflow-hidden flex items-center justify-center">
                      {product.imageUrl ? (
                        <img 
                          src={product.imageUrl} 
                          alt={product.name} 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : (
                        <ShoppingBag className="w-12 h-12 text-[#2D2926]/30 dark:text-[#EFEDE9]/30 stroke-[1]" />
                      )}
                      <span className="absolute top-3 left-3 bg-white/95 dark:bg-[#181615]/95 text-[#2D2926] dark:text-[#EFEDE9] border border-[#2D2926]/10 dark:border-white/10 text-[9px] uppercase tracking-widest px-2.5 py-1 font-bold">
                        {product.category}
                      </span>
                    </div>

                    <div className="pt-4 pb-1 flex-1 flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="font-bold text-[#2D2926] dark:text-white text-xs uppercase tracking-wider line-clamp-1 group-hover:text-[#FF6321] transition-colors">
                            {product.name}
                          </h3>
                          <div className="text-right">
                            <span className="text-[#FF6321] font-mono font-bold text-xs block">
                              {product.price.toLocaleString('fr-FR')} $
                            </span>
                            <span className="text-[#2D2926]/50 dark:text-[#EFEDE9]/50 font-mono text-[10px] font-bold block mt-0.5">
                              {((product.price * (settings.exchangeRate || 2850))).toLocaleString('fr-FR')} FC
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-[#2D2926]/60 dark:text-[#EFEDE9]/60 line-clamp-2 h-8 leading-relaxed">
                          {product.description || "Aucune description fournie."}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#2D2926]/5 dark:border-white/5">
                        <button
                          onClick={() => addToCart(product)}
                          className="w-full py-2.5 border border-[#2D2926] dark:border-[#EFEDE9] text-[10px] uppercase font-bold hover:bg-[#2D2926] dark:hover:bg-[#EFEDE9] hover:text-white dark:hover:text-[#2D2926] transition-all cursor-pointer flex items-center justify-center gap-1.5 text-[#2D2926] dark:text-[#EFEDE9]"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Ajouter au Panier
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* PANIER / SHOPPING CART SECTION (1 COL) */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#201D1A] p-5 border border-[#2D2926]/10 dark:border-white/10 shadow-sm flex flex-col h-[520px]">
              <div className="flex items-center justify-between border-b border-[#2D2926]/10 dark:border-white/10 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-[#2D2926] dark:text-[#EFEDE9]" />
                  <h3 className="font-black text-xs uppercase tracking-widest text-[#2D2926] dark:text-white">Mon Panier</h3>
                </div>
                <span className="bg-[#2D2926] dark:bg-[#EFEDE9] text-white dark:text-[#2D2926] text-[9px] px-2.5 py-0.5 uppercase tracking-wider font-bold">
                  {cart.reduce((acc, item) => acc + item.quantity, 0)} articles
                </span>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center opacity-70">
                    <ShoppingBag className="w-12 h-12 text-[#FF6321]/30 stroke-[1.25] mb-3" />
                    <p className="text-xs text-[#2D2926] dark:text-[#EFEDE9] font-bold uppercase tracking-wider">Panier vide</p>
                    <p className="text-[10px] text-[#2D2926]/60 dark:text-[#EFEDE9]/60 mt-1 uppercase tracking-widest max-w-[180px] mx-auto">Ajoutez des articles de la boutique pour commencer vos achats</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div 
                      key={item.productId}
                      className="flex items-center justify-between gap-2 p-2.5 bg-white dark:bg-[#26211E] border border-[#2D2926]/5 dark:border-white/5 shadow-xs hover:border-[#2D2926]/15 dark:hover:border-white/15 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-xs text-[#2D2926] dark:text-[#EFEDE9] uppercase tracking-wider truncate">{item.name}</p>
                        <p className="text-[10px] text-[#FF6321] font-bold font-mono mt-0.5">
                          {item.price.toLocaleString('fr-FR')} $ <span className="text-[#2D2926]/50 dark:text-[#EFEDE9]/50 font-normal">({(item.price * (settings.exchangeRate || 2850)).toLocaleString('fr-FR')} FC)</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateQuantity(item.productId, -1)}
                          className="p-1 hover:bg-[#EFEDE9] dark:hover:bg-[#201D1A] text-[#2D2926] dark:text-[#EFEDE9] border border-[#2D2926]/15 dark:border-white/10 rounded-none cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold text-[#2D2926] dark:text-[#EFEDE9] w-5 text-center font-mono">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.productId, 1)}
                          className="p-1 hover:bg-[#EFEDE9] dark:hover:bg-[#201D1A] text-[#2D2926] dark:text-[#EFEDE9] border border-[#2D2926]/15 dark:border-white/10 rounded-none cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removeFromCart(item.productId, item.name)}
                          className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-none ml-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Checkout Calculation */}
              {cart.length > 0 && (
                <div className="pt-4 border-t border-[#2D2926]/10 dark:border-white/10 mt-4 space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#2D2926] dark:text-[#EFEDE9] font-bold uppercase tracking-wider">Solde à payer :</span>
                    <div className="flex flex-col items-end">
                      <span className="text-xl font-black text-[#FF6321] font-mono">
                        {cartTotal.toLocaleString('fr-FR')} $
                      </span>
                      <span className="text-[11px] font-bold text-[#2D2926]/60 dark:text-[#EFEDE9]/60 font-mono mt-0.5">
                        {(cartTotal * (settings.exchangeRate || 2850)).toLocaleString('fr-FR')} FC
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsCheckoutOpen(true)}
                    className="w-full py-3 bg-[#FF6321] hover:bg-[#2D2926] dark:hover:bg-[#EFEDE9] text-white dark:hover:text-[#2D2926] text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                  >
                    Valider &amp; Commander
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REAL-TIME ORDER TRACKING SECTION */}
      {activeTab === 'tracking' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-white p-6 border border-[#2D2926]/10 shadow-sm space-y-5">
            <h3 className="text-xl font-serif italic text-[#2D2926] flex items-center gap-2 border-b border-[#2D2926]/10 pb-3">
              <Clock className="w-5 h-5 text-[#FF6321]" />
              Suivi de Commande en Temps Réel
            </h3>

            {/* Tracking Search Input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Entrez votre numéro de commande Firebase (ex: eC9X...)"
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-[#EFEDE9]/30 border border-[#2D2926]/15 text-xs font-semibold tracking-wider text-[#2D2926] focus:outline-none focus:border-[#FF6321] focus:bg-white"
              />
              <button
                onClick={() => lookupOrder(trackingId)}
                disabled={isSearchingOrder}
                className="px-6 py-2.5 bg-[#2D2926] hover:bg-[#FF6321] text-white text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSearchingOrder ? 'Recherche...' : 'Rechercher'}
              </button>
            </div>

            {/* tracked order view */}
            {trackedOrder ? (
              <div className="space-y-6 pt-2">
                
                {/* Meta details */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-[#EFEDE9]/60 border border-[#2D2926]/10 text-xs">
                  <div>
                    <p className="text-[#2D2926]/60 text-[9px] uppercase tracking-widest font-black">CLIENT</p>
                    <p className="font-bold text-[#2D2926] mt-0.5">{trackedOrder.clientName}</p>
                    <p className="text-[#2D2926]/70 font-semibold">{trackedOrder.clientPhone}</p>
                  </div>
                  <div>
                    <p className="text-[#2D2926]/60 text-[9px] uppercase tracking-widest font-black">FACTURE (SOLDE)</p>
                    <p className="font-black text-[#FF6321] text-sm mt-0.5">
                      {trackedOrder.total.toLocaleString('fr-FR')} $ <span className="text-[10px] text-[#2D2926]/60 font-mono">({(trackedOrder.total * (settings.exchangeRate || 2850)).toLocaleString('fr-FR')} FC)</span>
                    </p>
                    <p className="text-[10px] text-[#2D2926]/70 font-semibold uppercase mt-0.5">
                      Paiement : {trackedOrder.paymentMethod}
                    </p>
                  </div>
                </div>

                {/* Progress Steps */}
                <div className="space-y-6 relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#2D2926]/10">
                  {trackedOrder.trackingSteps?.map((step, idx) => {
                    const isLast = idx === trackedOrder.trackingSteps.length - 1;
                    return (
                      <div key={idx} className="relative">
                        <div className={`absolute -left-[22px] top-1 w-3.5 h-3.5 rounded-full border bg-white flex items-center justify-center ${isLast ? 'border-[#FF6321]' : 'border-[#2D2926]'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${isLast ? 'bg-[#FF6321]' : 'bg-[#2D2926]'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 ${
                              step.status === 'delivered' ? 'bg-green-100 text-green-800' :
                              step.status === 'ready' ? 'bg-blue-100 text-blue-800' :
                              step.status === 'preparing' ? 'bg-amber-100 text-amber-800' :
                              step.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                              'bg-neutral-100 text-neutral-800'
                            }`}>
                              {step.status === 'pending' ? 'En attente de validation' :
                               step.status === 'preparing' ? 'En préparation' :
                               step.status === 'ready' ? 'Prêt au guichet' :
                               step.status === 'delivered' ? 'Livré et Validé' : 'Annulé'}
                            </span>
                            <span className="text-[10px] text-[#2D2926]/50 font-mono">
                              {new Date(step.timestamp).toLocaleString('fr-FR')}
                            </span>
                          </div>
                          <p className="text-xs text-[#2D2926]/70 mt-1 font-medium">{step.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Delivered state details */}
                {trackedOrder.status === 'delivered' && (
                  <div className="p-4 bg-green-50 border border-green-200 text-xs text-green-800 flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-bold">Commande Validée et Livrée !</p>
                      <p className="mt-0.5 font-normal opacity-90">Le gérant de POP CHOP a scanné et validé la livraison de cette facture.</p>
                    </div>
                  </div>
                )}
                
                {/* Print button on tracking view too */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => generatePDFInvoice(trackedOrder)}
                    className="px-4 py-2 border border-[#2D2926] text-[#2D2926] hover:bg-[#2D2926]/5 text-[10px] font-bold uppercase tracking-widest cursor-pointer transition-colors"
                  >
                    <FileText className="w-4 h-4 text-[#2D2926]/70" />
                    Imprimer Facture (PDF)
                  </button>
                </div>

              </div>
            ) : (
              <div className="text-center py-10 opacity-75">
                <Compass className="w-10 h-10 text-[#FF6321]/30 mx-auto stroke-[1.25] mb-2" />
                <p className="text-xs text-[#2D2926] font-bold uppercase tracking-wider">Aucun suivi actif sélectionné</p>
                <p className="text-[10px] text-[#2D2926]/60 mt-0.5 max-w-xs mx-auto uppercase tracking-widest">Saisissez l'ID de commande reçu à la validation pour voir sa progression en direct.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RECEIPT / QR CODE VIEW */}
      {activeTab === 'receipt' && currentOrder && (
        <div className="max-w-xl mx-auto bg-white border border-[#2D2926]/10 overflow-hidden">
          {/* Header */}
          <div className="bg-[#EFEDE9] p-6 text-center border-b border-[#2D2926]/10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#2D2926] text-white text-[9px] font-mono tracking-widest uppercase font-bold mb-3">
              <Sparkles className="w-3 h-3" />
              Commande validée avec succès
            </span>
            <h3 className="text-xl font-serif italic text-[#2D2926]">Reçu &amp; QR Code POP CHOP</h3>
            <p className="text-[10px] uppercase tracking-wider text-[#2D2926]/60 mt-1 font-mono">Conservez précieusement ces informations</p>
          </div>

          <div className="p-6 space-y-6">
            
            {/* QR Code section */}
            <div className="flex flex-col items-center justify-center p-5 bg-white border border-[#2D2926]/5 shadow-xs text-center">
              <p className="text-[10px] text-[#2D2926]/50 font-mono uppercase tracking-widest mb-2">QR Code unique de commande</p>
              
              <div className="p-3 bg-[#EFEDE9]/30 border border-[#2D2926]/10">
                {/* Dynamically generated QR Code using public qrserver API */}
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentOrder.id)}`}
                  alt="Order QR Code"
                  className="w-40 h-40 object-contain"
                />
              </div>

              <div className="mt-4 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#2D2926]/70">Code de Commande :</p>
                <p className="text-xs font-mono font-bold text-[#FF6321] select-all bg-[#EFEDE9] px-4 py-1.5 border border-[#2D2926]/10">
                  {currentOrder.id}
                </p>
              </div>
              
              <p className="text-[11px] text-[#2D2926]/60 max-w-xs mt-3.5 leading-relaxed uppercase tracking-wider font-bold">
                Présentez ce QR Code au livreur ou au guichet de la boutique POP CHOP situé à 
                <span className="text-[#FF6321]"> Avenue Lisala N1, Ngaliema</span> pour récupérer votre colis.
              </p>
            </div>

            {/* Recipient Details & Solde */}
            <div className="space-y-4">
              <h4 className="text-[11px] font-bold text-[#2D2926]/60 uppercase tracking-widest font-mono border-b border-[#2D2926]/10 pb-1.5">Détail des achats</h4>
              
              <div className="space-y-2">
                {currentOrder.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs text-[#2D2926]">
                    <span className="font-bold uppercase text-[11px] tracking-wide">{item.name} <span className="text-[#2D2926]/50 font-mono font-normal">x{item.quantity}</span></span>
                    <div className="text-right">
                      <span className="font-mono text-[#FF6321] font-bold">{(item.price * item.quantity).toLocaleString('fr-FR')} $</span>
                      <span className="block text-[9px] text-[#2D2926]/50 font-mono">({(item.price * item.quantity * (settings.exchangeRate || 2850)).toLocaleString('fr-FR')} FC)</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2.5 border-t border-[#2D2926]/10 flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-[#2D2926]">Montant Total (Solde) :</span>
                <div className="flex flex-col items-end">
                  <span className="text-md font-extrabold text-[#FF6321]">
                    {currentOrder.total.toLocaleString('fr-FR')} $
                  </span>
                  <span className="text-[10px] font-bold text-[#2D2926]/50 font-mono">
                    {(currentOrder.total * (settings.exchangeRate || 2850)).toLocaleString('fr-FR')} FC
                  </span>
                </div>
              </div>
            </div>

            {/* Client info & payment details */}
            <div className="p-4 bg-[#EFEDE9]/40 border border-[#2D2926]/10 text-xs space-y-2 text-[#2D2926]">
              <div className="flex justify-between"><span className="text-[#2D2926]/60 uppercase tracking-widest font-bold text-[9px]">Acheteur :</span> <span className="font-bold text-[#2D2926] uppercase">{currentOrder.clientName}</span></div>
              <div className="flex justify-between"><span className="text-[#2D2926]/60 uppercase tracking-widest font-bold text-[9px]">Téléphone :</span> <span className="font-bold">{currentOrder.clientPhone}</span></div>
              <div className="flex justify-between"><span className="text-[#2D2926]/60 uppercase tracking-widest font-bold text-[9px]">Méthode :</span> <span className="font-bold capitalize">{currentOrder.paymentMethod} Money</span></div>
              <div className="flex justify-between"><span className="text-[#2D2926]/60 uppercase tracking-widest font-bold text-[9px]">Réf Transaction :</span> <span className="font-mono font-bold text-[#FF6321]">{currentOrder.paymentTxRef || 'Cash'}</span></div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => generatePDFInvoice(currentOrder)}
                className="flex-1 py-3 bg-[#FF6321] hover:bg-[#2D2926] text-white text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer shadow-sm"
              >
                Télécharger Facture (PDF)
              </button>
              <button
                onClick={() => {
                  setTrackingId(currentOrder.id);
                  setActiveTab('tracking');
                  showToast('Redirection vers le suivi de commande', 'info');
                }}
                className="px-4 py-3 bg-white border border-[#2D2926] text-[#2D2926] hover:bg-[#2D2926]/5 text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer"
              >
                Suivre en direct
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CHECKOUT MODAL POPUP */}
      <AnimatePresence>
        {isCheckoutOpen && (
          <div className="fixed inset-0 bg-[#2D2926]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white border border-[#2D2926]/10 max-w-lg w-full overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="bg-[#EFEDE9] p-5 border-b border-[#2D2926]/10 flex justify-between items-center">
                <div>
                  <h4 className="font-black text-[#2D2926] uppercase tracking-widest text-xs">Validation de commande</h4>
                  <p className="text-[10px] text-[#2D2926]/60 mt-0.5 uppercase tracking-widest font-bold">
                    Finalisez vos achats de {cartTotal.toLocaleString('fr-FR')} $ ({ (cartTotal * (settings.exchangeRate || 2850)).toLocaleString('fr-FR') } FC)
                  </p>
                </div>
                <button
                  onClick={() => setIsCheckoutOpen(false)}
                  className="p-1 hover:bg-[#2D2926]/5 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5 text-[#2D2926] rotate-90" />
                </button>
              </div>

              {/* Modal Body / Form */}
              <form onSubmit={handleCheckout} className="p-6 overflow-y-auto space-y-5 flex-1">
                
                {/* Client Information */}
                <div className="space-y-3.5">
                  <h5 className="text-[10px] font-bold text-[#2D2926]/50 uppercase tracking-widest font-mono border-b border-[#2D2926]/5 pb-1">Coordonnées Client</h5>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#2D2926]/70 mb-1">Votre Nom complet *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Maria Kabedi"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 text-xs text-[#2D2926] focus:outline-none focus:border-[#FF6321]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#2D2926]/70 mb-1">Téléphone de livraison *</label>
                      <input
                        type="tel"
                        required
                        placeholder="Ex: 0824589322"
                        value={clientPhone}
                        onChange={(e) => setClientPhone(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 text-xs text-[#2D2926] focus:outline-none focus:border-[#FF6321]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#2D2926]/70 mb-1">Adresse Email (Optionnel)</label>
                    <input
                      type="email"
                      placeholder="Ex: maria.business@gmail.com"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 text-xs text-[#2D2926] focus:outline-none focus:border-[#FF6321]"
                    />
                  </div>
                </div>

                {/* Mobile Payment Instructions */}
                <div className="space-y-3.5">
                  <h5 className="text-[10px] font-bold text-[#2D2926]/50 uppercase tracking-widest font-mono border-b border-[#2D2926]/5 pb-1">Méthode de Paiement</h5>
                  
                  {/* Selector */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { key: 'airtel', label: 'Airtel Money', color: 'border-red-500 text-red-700' },
                      { key: 'orange', label: 'Orange Money', color: 'border-orange-500 text-orange-700' },
                      { key: 'mpesa', label: 'M-Pesa', color: 'border-blue-500 text-blue-700' },
                      { key: 'cash', label: 'Au Guichet (Cash)', color: 'border-emerald-600 text-emerald-800' }
                    ].map((method) => (
                      <button
                        key={method.key}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(method.key as any);
                          if (method.key === 'cash') setPaymentTxRef('');
                        }}
                        className={`p-2.5 border text-center transition-all cursor-pointer flex flex-col justify-center items-center gap-1 rounded-none uppercase tracking-wider font-bold text-[9px] ${
                          paymentMethod === method.key 
                            ? 'bg-[#EFEDE9] border-[#FF6321] text-[#FF6321] ring-1 ring-[#FF6321]' 
                            : 'bg-white border-[#2D2926]/10 hover:bg-[#EFEDE9]/30 text-[#2D2926]/70'
                        }`}
                      >
                        <span>{method.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Payment numbers display for clients */}
                  {paymentMethod !== 'cash' && (
                    <div className="p-4 bg-[#EFEDE9]/60 border border-[#2D2926]/10 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#2D2926] uppercase tracking-wider">
                        <Phone className="w-4 h-4 text-[#FF6321]" />
                        <span>Instructions de transfert :</span>
                      </div>
                      
                      <p className="text-[11px] text-[#2D2926]/70 leading-relaxed font-semibold">
                        Veuillez effectuer le transfert de <span className="font-extrabold text-[#FF6321]">{cartTotal.toLocaleString('fr-FR')} $ ({ (cartTotal * (settings.exchangeRate || 2850)).toLocaleString('fr-FR') } FC)</span> au numéro du gérant de la boutique ci-dessous :
                      </p>

                      <div className="flex items-center justify-between p-2.5 bg-white border border-[#2D2926]/10 mt-1">
                        <span className="text-[10px] text-[#2D2926]/60 font-black uppercase tracking-wider">{paymentMethod} MONEY :</span>
                        <span className="text-xs font-mono font-black text-[#FF6321] tracking-wide select-all">
                          {getPaymentNumber()}
                        </span>
                      </div>

                      <div className="pt-2">
                        <label className="block text-[10px] font-bold text-[#2D2926] uppercase mb-1 tracking-wider">Numéro / Référence de transaction SMS *</label>
                        <input
                          type="text"
                          required
                          placeholder="Entrez le code ou ID de transaction SMS"
                          value={paymentTxRef}
                          onChange={(e) => setPaymentTxRef(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-[#FF6321]/40 focus:outline-none focus:border-[#FF6321] text-xs text-[#2D2926]"
                        />
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'cash' && (
                    <div className="p-4 bg-emerald-50 border border-emerald-150 text-xs text-emerald-800 space-y-1">
                      <p className="font-bold uppercase tracking-wider">Paiement en espèces lors de la récupération</p>
                      <p className="text-[11px] opacity-90 leading-relaxed font-semibold">
                        Vous réglerez la somme de <span className="font-bold">{cartTotal.toLocaleString('fr-FR')} $ ({ (cartTotal * (settings.exchangeRate || 2850)).toLocaleString('fr-FR') } FC)</span> directement au guichet physique ou au livreur lors de la remise de vos vêtements.
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="pt-4 border-t border-[#2D2926]/10 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCheckoutOpen(false)}
                    className="flex-1 py-3 border border-[#2D2926] text-[#2D2926] hover:bg-[#2D2926]/5 text-xs font-bold uppercase tracking-widest cursor-pointer transition-colors"
                  >
                    Retour au panier
                  </button>
                  <button
                    type="submit"
                    disabled={submittingOrder}
                    className="flex-1 py-3 bg-[#FF6321] hover:bg-[#2D2926] text-white text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {submittingOrder ? 'Validation...' : 'Confirmer Commande'}
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
