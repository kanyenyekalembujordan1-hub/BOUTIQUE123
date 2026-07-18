/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Settings, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle, 
  Search, 
  RefreshCw, 
  Smartphone, 
  UserCheck, 
  TrendingUp, 
  Package, 
  ListOrdered,
  FileImage,
  UploadCloud,
  Check,
  AlertCircle,
  X,
  MapPin,
  Clock,
  ExternalLink,
  BarChart3,
  DollarSign,
  Calendar
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import jsQR from 'jsqr';
import { 
  collection, 
  doc, 
  updateDoc, 
  addDoc, 
  deleteDoc, 
  getDocs,
  setDoc,
  onSnapshot
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product, Order, ShopSettings, TrackingStep } from '../types';

interface AdminPanelProps {
  settings: ShopSettings;
  products: Product[];
  orders: Order[];
  onSettingsUpdate: (newSettings: ShopSettings) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export default function AdminPanel({ settings, products, orders, onSettingsUpdate, showToast }: AdminPanelProps) {
  const [adminTab, setAdminTab] = useState<'scan' | 'products' | 'orders' | 'settings' | 'dashboard'>('dashboard');
  
  // Settings modification
  const [adminEmail, setAdminEmail] = useState(settings.adminEmail);
  const [adminPhones, setAdminPhones] = useState(settings.adminPhones || '0998283123');
  const [airtelMoney, setAirtelMoney] = useState(settings.airtelMoney);
  const [orangeMoney, setOrangeMoney] = useState(settings.orangeMoney);
  const [mpesa, setMpesa] = useState(settings.mpesa);
  const [address, setAddress] = useState(settings.address);
  const [slogan, setSlogan] = useState(settings.slogan);
  const [facebook, setFacebook] = useState(settings.facebook);
  const [instagram, setInstagram] = useState(settings.instagram);
  const [tiktok, setTiktok] = useState(settings.tiktok);
  const [exchangeRate, setExchangeRate] = useState(settings.exchangeRate || 2850);
  const [savingSettings, setSavingSettings] = useState(false);

  // Products CRUD State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodPriceFC, setProdPriceFC] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodDescription, setProdDescription] = useState('');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imageSourceTab, setImageSourceTab] = useState<'upload' | 'url'>('upload');

  // Scanner State
  const [manualOrderId, setManualOrderId] = useState('');
  const [scannedOrder, setScannedOrder] = useState<Order | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Selected Order for status changes
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Stats / Dashboard States
  const [statsSource, setStatsSource] = useState<'delivered' | 'active'>('delivered');
  const [timeRange, setTimeRange] = useState<'day' | 'month'>('day');

  // Stats Calculations
  const validatedOrders = orders.filter(o => o.status === 'delivered');
  const allActiveOrders = orders.filter(o => o.status !== 'cancelled');

  const sourceOrders = statsSource === 'delivered' ? validatedOrders : allActiveOrders;
  const rate = settings.exchangeRate || 2850;

  const totalRevenueUSD = sourceOrders.reduce((sum, o) => sum + o.total, 0);
  const totalRevenueFC = totalRevenueUSD * rate;

  const totalOrdersCount = sourceOrders.length;
  const avgOrderUSD = totalOrdersCount > 0 ? totalRevenueUSD / totalOrdersCount : 0;
  const avgOrderFC = avgOrderUSD * rate;

  const maxOrderUSD = sourceOrders.length > 0 ? Math.max(...sourceOrders.map(o => o.total)) : 0;
  const maxOrderFC = maxOrderUSD * rate;

  // Daily revenue aggregation
  const getDailyRevenueData = () => {
    const dailyMap: { [key: string]: number } = {};
    
    sourceOrders.forEach(order => {
      if (!order.createdAt) return;
      const dateStr = order.createdAt.split('T')[0]; // YYYY-MM-DD
      dailyMap[dateStr] = (dailyMap[dateStr] || 0) + order.total;
    });

    const sortedDays = Object.keys(dailyMap).sort();
    
    if (sortedDays.length === 0) {
      return [{ name: "Aucun", "Revenu ($)": 0, "Revenu (FC)": 0 }];
    }

    return sortedDays.map(dateStr => {
      const parts = dateStr.split('-');
      const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateStr;
      const usd = dailyMap[dateStr];
      return {
        name: formattedDate,
        "Revenu ($)": usd,
        "Revenu (FC)": Math.round(usd * rate),
      };
    });
  };

  // Monthly revenue aggregation
  const getMonthlyRevenueData = () => {
    const monthlyMap: { [key: string]: number } = {};
    const monthNames = [
      "Janv", "Févr", "Mars", "Avril", "Mai", "Juin", 
      "Juil", "Août", "Sept", "Oct", "Nov", "Déc"
    ];

    sourceOrders.forEach(order => {
      if (!order.createdAt) return;
      const dateParts = order.createdAt.split('T')[0].split('-');
      if (dateParts.length < 2) return;
      const yearMonth = `${dateParts[0]}-${dateParts[1]}`; // YYYY-MM
      monthlyMap[yearMonth] = (monthlyMap[yearMonth] || 0) + order.total;
    });

    const sortedMonths = Object.keys(monthlyMap).sort();

    if (sortedMonths.length === 0) {
      return [{ name: "Aucun", "Revenu ($)": 0, "Revenu (FC)": 0 }];
    }

    return sortedMonths.map(ym => {
      const parts = ym.split('-');
      const year = parts[0];
      const monthIdx = parseInt(parts[1]) - 1;
      const formattedMonth = monthIdx >= 0 && monthIdx < 12 ? `${monthNames[monthIdx]} ${year}` : ym;
      const usd = monthlyMap[ym];
      return {
        name: formattedMonth,
        "Revenu ($)": usd,
        "Revenu (FC)": Math.round(usd * rate),
      };
    });
  };

  // Category revenue aggregation
  const getCategoryRevenueData = () => {
    const categoryMap: { [key: string]: number } = {};

    sourceOrders.forEach(order => {
      order.items?.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        const category = product ? product.category : 'Autre/Inconnu';
        categoryMap[category] = (categoryMap[category] || 0) + (item.price * item.quantity);
      });
    });

    const data = Object.keys(categoryMap).map(cat => {
      const usd = categoryMap[cat];
      return {
        name: cat.toUpperCase(),
        "Revenu ($)": usd,
        "Revenu (FC)": Math.round(usd * rate),
      };
    });

    if (data.length === 0) {
      return [{ name: "Aucune Catégorie", "Revenu ($)": 0, "Revenu (FC)": 0 }];
    }

    return data;
  };

  // Payment method usage aggregation
  const getPaymentMethodData = () => {
    const paymentMap: { [key: string]: number } = {
      airtel: 0,
      orange: 0,
      mpesa: 0,
      cash: 0
    };

    sourceOrders.forEach(order => {
      const method = order.paymentMethod || 'cash';
      paymentMap[method] = (paymentMap[method] || 0) + order.total;
    });

    const labelMap: { [key: string]: string } = {
      airtel: 'Airtel Money',
      orange: 'Orange Money',
      mpesa: 'M-Pesa',
      cash: 'Espèces'
    };

    const data = Object.keys(paymentMap).map(key => {
      const usd = paymentMap[key];
      return {
        name: labelMap[key] || key,
        "Revenu ($)": usd,
        "Revenu (FC)": Math.round(usd * rate),
      };
    }).filter(d => d["Revenu ($)"] > 0);

    if (data.length === 0) {
      return [{ name: "Aucun Paiement", "Revenu ($)": 0, "Revenu (FC)": 0 }];
    }

    return data;
  };

  // Stop camera when component unmounts or tab changes
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [adminTab]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setScanning(false);
  };

  const startCamera = async () => {
    setCameraActive(true);
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true"); // required to tell iOS safari we don't want fullscreen
        videoRef.current.play();
        requestAnimationFrame(tick);
      }
    } catch (err) {
      console.error("Camera access failed", err);
      showToast("Impossible d'accéder à la caméra. Utilisez le mode saisie manuelle ou import d'image.", "error");
      setCameraActive(false);
      setScanning(false);
    }
  };

  const tick = () => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      if (scanning) {
        requestAnimationFrame(tick);
      }
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code) {
          handleQRDecoded(code.data);
          return; // Stop scanning once decoded
        }
      }
    }
    if (scanning) {
      requestAnimationFrame(tick);
    }
  };

  const handleQRDecoded = (orderId: string) => {
    stopCamera();
    showToast("QR Code scanné avec succès !", "success");
    loadScannedOrder(orderId.trim());
  };

  // Upload static QR image to scan
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
          handleQRDecoded(code.data);
        } else {
          showToast("Aucun QR Code valide détecté dans l'image.", "error");
        }
      }
    };
    img.src = URL.createObjectURL(file);
  };

  const loadScannedOrder = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (order) {
      setScannedOrder(order);
      setManualOrderId(orderId);
    } else {
      setScannedOrder(null);
      showToast("Commande introuvable dans la base de données.", "error");
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualOrderId.trim()) return;
    loadScannedOrder(manualOrderId.trim());
  };

  // Deliver / Validate Order
  const handleDeliverOrder = async (orderId: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const step: TrackingStep = {
        status: 'delivered',
        description: 'La commande a été scannée et remise au client au guichet de la boutique POP CHOP.',
        timestamp: new Date().toISOString()
      };

      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      const updatedSteps = [...(order.trackingSteps || []), step];

      await updateDoc(orderRef, {
        status: 'delivered',
        deliveredAt: new Date().toISOString(),
        trackingSteps: updatedSteps
      });

      // Update local state if needed
      if (scannedOrder && scannedOrder.id === orderId) {
        setScannedOrder({ ...scannedOrder, status: 'delivered', trackingSteps: updatedSteps });
      }
      
      showToast("Commande validée et marquée comme LIVRÉE !", "success");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      showToast("Erreur lors de la validation de la livraison.", "error");
    }
  };

  // Change tracking step or status
  const handleUpdateOrderStatus = async (orderId: string, nextStatus: 'preparing' | 'ready' | 'cancelled' | 'delivered') => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      let description = '';
      switch(nextStatus) {
        case 'preparing': 
          description = 'Vos vêtements et accessoires sont en cours de rassemblement et repassage.'; 
          break;
        case 'ready': 
          description = 'Votre commande est prête à être récupérée au guichet (Avenue Lisala N1) ou remise au livreur.'; 
          break;
        case 'delivered': 
          description = 'Commande livrée et réceptionnée avec succès.'; 
          break;
        case 'cancelled': 
          description = 'Commande annulée par la boutique POP CHOP.'; 
          break;
      }

      const step: TrackingStep = {
        status: nextStatus,
        description,
        timestamp: new Date().toISOString()
      };

      const updatedSteps = [...(order.trackingSteps || []), step];

      await updateDoc(orderRef, {
        status: nextStatus,
        deliveredAt: nextStatus === 'delivered' ? new Date().toISOString() : null,
        trackingSteps: updatedSteps
      });

      showToast(`Statut de la commande mis à jour : ${nextStatus.toUpperCase()}`, "success");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      showToast("Échec de la mise à jour du statut", "error");
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer définitivement cette commande ?")) return;
    try {
      await deleteDoc(doc(db, 'orders', orderId));
      if (scannedOrder && scannedOrder.id === orderId) {
        setScannedOrder(null);
        setManualOrderId('');
      }
      showToast("Commande supprimée de la base de données", "success");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `orders/${orderId}`);
      showToast("Échec de la suppression de la commande", "error");
    }
  };

  // Settings Save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPhones.trim()) {
      showToast("Le numéro de téléphone du gérant est obligatoire", "error");
      return;
    }

    setSavingSettings(true);
    try {
      const updatedSettings: ShopSettings = {
        adminEmail: adminEmail.trim(),
        adminPhones: adminPhones.trim(),
        airtelMoney: airtelMoney.trim(),
        orangeMoney: orangeMoney.trim(),
        mpesa: mpesa.trim(),
        address: address.trim(),
        slogan: slogan.trim(),
        facebook: facebook.trim(),
        instagram: instagram.trim(),
        tiktok: tiktok.trim(),
        exchangeRate: exchangeRate
      };

      await setDoc(doc(db, 'settings', 'shop_config'), updatedSettings);
      onSettingsUpdate(updatedSettings);
      showToast("Paramètres généraux sauvegardés avec succès !", "success");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/shop_config');
      showToast("Erreur lors de la mise à jour des paramètres", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  // Product Create/Edit Submit
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || !prodPrice || !prodCategory.trim()) {
      showToast("Le nom, le prix et la catégorie sont obligatoires", "error");
      return;
    }

    setSavingProduct(true);
    try {
      const priceNum = parseFloat(prodPrice);
      if (isNaN(priceNum) || priceNum <= 0) {
        showToast("Veuillez entrer un prix valide supérieur à 0", "error");
        return;
      }

      const productPayload = {
        name: prodName.trim(),
        price: priceNum,
        category: prodCategory.trim(),
        description: prodDescription.trim(),
        imageUrl: prodImageUrl.trim() || 'https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=300',
        createdAt: (editingProduct && editingProduct.createdAt) || new Date().toISOString()
      };

      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), productPayload);
        showToast(`Article "${prodName}" modifié avec succès`, "success");
      } else {
        await addDoc(collection(db, 'products'), productPayload);
        showToast(`Nouvel article "${prodName}" ajouté à la boutique`, "success");
      }

      // Reset states
      setIsProductModalOpen(false);
      setEditingProduct(null);
      setProdName('');
      setProdPrice('');
      setProdPriceFC('');
      setProdCategory('');
      setProdDescription('');
      setProdImageUrl('');
      setImageSourceTab('upload');
    } catch (err) {
      const path = editingProduct ? `products/${editingProduct.id}` : 'products';
      const op = editingProduct ? OperationType.UPDATE : OperationType.CREATE;
      handleFirestoreError(err, op, path);
      showToast("Erreur lors de l'enregistrement du produit", "error");
    } finally {
      setSavingProduct(false);
    }
  };

  const handleEditProductClick = (product: Product) => {
    setEditingProduct(product);
    setProdName(product.name);
    setProdPrice(product.price.toString());
    const rate = settings.exchangeRate || 2850;
    setProdPriceFC(Math.round(product.price * rate).toString());
    setProdCategory(product.category);
    setProdDescription(product.description || '');
    setProdImageUrl(product.imageUrl || '');
    if (product.imageUrl && (product.imageUrl.startsWith('http://') || product.imageUrl.startsWith('https://'))) {
      setImageSourceTab('url');
    } else {
      setImageSourceTab('upload');
    }
    setIsProductModalOpen(true);
  };

  const handleDeleteProduct = async (productId: string, name: string) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir retirer "${name}" de la boutique ?`)) return;
    try {
      await deleteDoc(doc(db, 'products', productId));
      showToast(`"${name}" supprimé de la boutique`, "success");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `products/${productId}`);
      showToast("Échec de la suppression du produit", "error");
    }
  };

  const handleProductImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processAndSetProductImage(file);
  };

  const processAndSetProductImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast("Veuillez sélectionner un fichier image valide.", "error");
      return;
    }
    
    setIsProcessingImage(true);
    try {
      const base64 = await compressAndConvertToBase64(file);
      setProdImageUrl(base64);
      showToast("Image importée et optimisée avec succès !", "success");
    } catch (err) {
      console.error(err);
      showToast("Erreur lors du traitement de l'image.", "error");
    } finally {
      setIsProcessingImage(false);
    }
  };

  const compressAndConvertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 800; // Optimal max dimension for standard screens and storage space
          let width = img.width;
          let height = img.height;
          
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.75); // High quality compressed JPEG
            resolve(dataUrl);
          } else {
            resolve(event.target?.result as string);
          }
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  return (
    <div id="admin-panel" className="space-y-8">
      
      {/* Admin Title & Bar - Artistic Flair */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#2D2926]/10 pb-4">
        <div>
          <h2 className="text-2xl font-serif italic text-[#2D2926] flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-[#FF6321]" />
            Espace Gérant - BOUTIQUE POP CHOP
          </h2>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#2D2926]/60 mt-1">Pilotez vos stocks, validez les paiements mobiles et livrez vos commandes.</p>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-[#EFEDE9] p-1 border border-[#2D2926]/10 flex-wrap gap-1">
          <button 
            onClick={() => setAdminTab('dashboard')}
            className={`px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer border ${adminTab === 'dashboard' ? 'bg-[#2D2926] border-[#2D2926] text-white' : 'text-[#2D2926] border-transparent hover:bg-[#2D2926]/5'}`}
          >
            Tableau de Bord
          </button>
          <button 
            onClick={() => setAdminTab('scan')}
            className={`px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer border ${adminTab === 'scan' ? 'bg-[#2D2926] border-[#2D2926] text-white' : 'text-[#2D2926] border-transparent hover:bg-[#2D2926]/5'}`}
          >
            Scanner QR
          </button>
          <button 
            onClick={() => setAdminTab('products')}
            className={`px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer border ${adminTab === 'products' ? 'bg-[#2D2926] border-[#2D2926] text-white' : 'text-[#2D2926] border-transparent hover:bg-[#2D2926]/5'}`}
          >
            Produits
          </button>
          <button 
            onClick={() => setAdminTab('orders')}
            className={`px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer border ${adminTab === 'orders' ? 'bg-[#2D2926] border-[#2D2926] text-white' : 'text-[#2D2926] border-transparent hover:bg-[#2D2926]/5'}`}
          >
            Commandes ({orders.length})
          </button>
          <button 
            onClick={() => setAdminTab('settings')}
            className={`px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer border ${adminTab === 'settings' ? 'bg-[#2D2926] border-[#2D2926] text-white' : 'text-[#2D2926] border-transparent hover:bg-[#2D2926]/5'}`}
          >
            Paramètres
          </button>
        </div>
      </div>

      {/* DASHBOARD SYSTEM */}
      {adminTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Filters & Mode Selection */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 border border-[#2D2926]/10 shadow-sm rounded-none">
            <div>
              <h3 className="font-serif italic text-md text-[#2D2926]">Tableau de Bord des Revenus</h3>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#2D2926]/50 mt-0.5">Suivi en temps réel des ventes et de la comptabilité</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Stats Source Toggle */}
              <div className="flex bg-[#EFEDE9] p-0.5 border border-[#2D2926]/10">
                <button
                  type="button"
                  onClick={() => setStatsSource('delivered')}
                  className={`px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all border ${statsSource === 'delivered' ? 'bg-[#2D2926] text-white border-[#2D2926]' : 'text-[#2D2926] border-transparent hover:bg-[#2D2926]/5'}`}
                >
                  Livrées (Validées)
                </button>
                <button
                  type="button"
                  onClick={() => setStatsSource('active')}
                  className={`px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all border ${statsSource === 'active' ? 'bg-[#2D2926] text-white border-[#2D2926]' : 'text-[#2D2926] border-transparent hover:bg-[#2D2926]/5'}`}
                >
                  Toutes Actives
                </button>
              </div>

              {/* Time Range Toggle */}
              <div className="flex bg-[#EFEDE9] p-0.5 border border-[#2D2926]/10">
                <button
                  type="button"
                  onClick={() => setTimeRange('day')}
                  className={`px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all border ${timeRange === 'day' ? 'bg-[#2D2926] text-white border-[#2D2926]' : 'text-[#2D2926] border-transparent hover:bg-[#2D2926]/5'}`}
                >
                  Par Jour
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRange('month')}
                  className={`px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all border ${timeRange === 'month' ? 'bg-[#2D2926] text-white border-[#2D2926]' : 'text-[#2D2926] border-transparent hover:bg-[#2D2926]/5'}`}
                >
                  Par Mois
                </button>
              </div>
            </div>
          </div>

          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Revenue */}
            <div className="bg-white p-4 border border-[#2D2926]/10 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#FF6321]" />
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#2D2926]/50 font-mono">Chiffre d'Affaires</p>
                  <h4 className="text-xl font-extrabold text-[#FF6321] font-mono mt-1">{totalRevenueUSD.toLocaleString('fr-FR')} $</h4>
                  <p className="text-[11px] font-bold text-[#2D2926]/60 font-mono mt-0.5">{Math.round(totalRevenueFC).toLocaleString('fr-FR')} FC</p>
                </div>
                <div className="p-2 bg-[#EFEDE9]/40 border border-[#2D2926]/5">
                  <TrendingUp className="w-4 h-4 text-[#FF6321]" />
                </div>
              </div>
              <p className="text-[9px] font-semibold text-[#2D2926]/40 mt-3 uppercase tracking-wider font-mono">Basé sur {totalOrdersCount} commandes</p>
            </div>

            {/* Card 2: Total Orders */}
            <div className="bg-white p-4 border border-[#2D2926]/10 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#2D2926]" />
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#2D2926]/50 font-mono">Volume Commandes</p>
                  <h4 className="text-xl font-extrabold text-[#2D2926] font-mono mt-1">{totalOrdersCount}</h4>
                  <p className="text-[11px] font-bold text-[#2D2926]/60 uppercase tracking-wider mt-0.5">
                    {statsSource === 'delivered' ? 'Livrées au guichet' : 'Total non-annulées'}
                  </p>
                </div>
                <div className="p-2 bg-[#EFEDE9]/40 border border-[#2D2926]/5">
                  <ListOrdered className="w-4 h-4 text-[#2D2926]" />
                </div>
              </div>
              <p className="text-[9px] font-semibold text-[#2D2926]/40 mt-3 uppercase tracking-wider font-mono">
                {orders.filter(o => o.status === 'pending').length} en attente de traitement
              </p>
            </div>

            {/* Card 3: Average Ticket */}
            <div className="bg-white p-4 border border-[#2D2926]/10 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#EFEDE9]" />
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#2D2926]/50 font-mono">Panier Moyen</p>
                  <h4 className="text-xl font-extrabold text-[#2D2926] font-mono mt-1">{avgOrderUSD.toLocaleString('fr-FR')} $</h4>
                  <p className="text-[11px] font-bold text-[#2D2926]/60 font-mono mt-0.5">{Math.round(avgOrderFC).toLocaleString('fr-FR')} FC</p>
                </div>
                <div className="p-2 bg-[#EFEDE9]/40 border border-[#2D2926]/5">
                  <DollarSign className="w-4 h-4 text-[#2D2926]/70" />
                </div>
              </div>
              <p className="text-[9px] font-semibold text-[#2D2926]/40 mt-3 uppercase tracking-wider font-mono">Par transaction gérée</p>
            </div>

            {/* Card 4: Best Sale */}
            <div className="bg-white p-4 border border-[#2D2926]/10 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#FF6321]" />
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#2D2926]/50 font-mono">Vente Record</p>
                  <h4 className="text-xl font-extrabold text-[#FF6321] font-mono mt-1">{maxOrderUSD.toLocaleString('fr-FR')} $</h4>
                  <p className="text-[11px] font-bold text-[#2D2926]/60 font-mono mt-0.5">{Math.round(maxOrderFC).toLocaleString('fr-FR')} FC</p>
                </div>
                <div className="p-2 bg-[#EFEDE9]/40 border border-[#2D2926]/5">
                  <Package className="w-4 h-4 text-[#FF6321]" />
                </div>
              </div>
              <p className="text-[9px] font-semibold text-[#2D2926]/40 mt-3 uppercase tracking-wider font-mono">Plus haut montant validé</p>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Revenue Area Chart - 2 columns span */}
            <div className="bg-white p-5 border border-[#2D2926]/10 shadow-sm rounded-none lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center border-b border-[#EFEDE9] pb-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-[#2D2926] flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-[#FF6321]" />
                  Revenus Générés {timeRange === 'day' ? 'par Jour' : 'par Mois'}
                </h4>
                <span className="text-[10px] font-mono font-bold text-[#2D2926]/50">Affiché en Dollars ($)</span>
              </div>

              <div className="h-72 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={timeRange === 'day' ? getDailyRevenueData() : getMonthlyRevenueData()}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF6321" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#FF6321" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFEDE9" />
                    <XAxis 
                      dataKey="name" 
                      tickLine={false} 
                      axisLine={false}
                      tick={{ fill: '#2D2926', fontSize: 10, fontWeight: 600 }}
                    />
                    <YAxis 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{ fill: '#2D2926', fontSize: 10, fontWeight: 600 }}
                      tickFormatter={(v) => `${v}$`}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#2D2926', 
                        borderColor: '#2D2926',
                        borderRadius: '0px',
                        color: '#FFFFFF'
                      }}
                      itemStyle={{ color: '#FF6321', fontFamily: 'monospace', fontWeight: 'bold' }}
                      labelStyle={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      formatter={(value: any, name: any, props: any) => {
                        const usd = Number(value);
                        const fc = Math.round(usd * rate);
                        return [`${usd.toLocaleString('fr-FR')} $ (${fc.toLocaleString('fr-FR')} FC)`, 'Revenu'];
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="Revenu ($)" 
                      stroke="#FF6321" 
                      strokeWidth={2.5}
                      fillOpacity={1} 
                      fill="url(#colorRevenue)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category Pie Chart - 1 column span */}
            <div className="bg-white p-5 border border-[#2D2926]/10 shadow-sm rounded-none space-y-4">
              <div className="border-b border-[#EFEDE9] pb-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-[#2D2926] flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-[#FF6321]" />
                  Ventes par Catégorie
                </h4>
              </div>

              <div className="h-72 w-full relative flex flex-col justify-between">
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={getCategoryRevenueData()}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="Revenu ($)"
                      >
                        {getCategoryRevenueData().map((entry, index) => {
                          const COLORS = ['#FF6321', '#2D2926', '#8F8A85', '#EFEDE9', '#4B5563'];
                          return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                        })}
                      </Pie>
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: '#2D2926', 
                          borderColor: '#2D2926',
                          borderRadius: '0px',
                          color: '#FFFFFF'
                        }}
                        itemStyle={{ color: '#FF6321', fontFamily: 'monospace', fontWeight: 'bold' }}
                        labelStyle={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: '11px' }}
                        formatter={(value: any, name: any) => {
                          const usd = Number(value);
                          const fc = Math.round(usd * rate);
                          return [`${usd.toLocaleString('fr-FR')} $ (${fc.toLocaleString('fr-FR')} FC)`, name];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Custom Legend */}
                <div className="grid grid-cols-2 gap-1.5 overflow-y-auto max-h-16 text-[9px] font-bold uppercase tracking-wide px-1">
                  {getCategoryRevenueData().map((entry, index) => {
                    const COLORS = ['#FF6321', '#2D2926', '#8F8A85', '#EFEDE9', '#4B5563'];
                    const color = COLORS[index % COLORS.length];
                    return (
                      <div key={index} className="flex items-center gap-1.5 truncate">
                        <span className="w-2 h-2 shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-[#2D2926]/70 truncate">{entry.name}</span>
                        <span className="text-mono text-[#FF6321] ml-auto">{entry["Revenu ($)"]}$</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Payment Method Bar Chart - Full Width or grid columns span */}
            <div className="bg-white p-5 border border-[#2D2926]/10 shadow-sm rounded-none lg:col-span-3 space-y-4">
              <div className="border-b border-[#EFEDE9] pb-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-[#2D2926] flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-[#FF6321]" />
                  Répartition des Revenus par Méthode de Paiement
                </h4>
              </div>

              <div className="h-64 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={getPaymentMethodData()}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFEDE9" />
                    <XAxis 
                      dataKey="name" 
                      tickLine={false} 
                      axisLine={false}
                      tick={{ fill: '#2D2926', fontSize: 10, fontWeight: 700 }}
                    />
                    <YAxis 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{ fill: '#2D2926', fontSize: 10, fontWeight: 600 }}
                      tickFormatter={(v) => `${v}$`}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#2D2926', 
                        borderColor: '#2D2926',
                        borderRadius: '0px',
                        color: '#FFFFFF'
                      }}
                      itemStyle={{ color: '#FF6321', fontFamily: 'monospace', fontWeight: 'bold' }}
                      labelStyle={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: '11px' }}
                      formatter={(value: any) => {
                        const usd = Number(value);
                        const fc = Math.round(usd * rate);
                        return [`${usd.toLocaleString('fr-FR')} $ (${fc.toLocaleString('fr-FR')} FC)`, 'Montant'];
                      }}
                    />
                    <Bar dataKey="Revenu ($)" fill="#2D2926" radius={[0, 0, 0, 0]}>
                      {getPaymentMethodData().map((entry, index) => {
                        const COLORS = ['#FF6321', '#2D2926', '#FF6321', '#2D2926'];
                        return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* SCAN / DELIVERY SYSTEM */}
      {adminTab === 'scan' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          
          {/* Scanner Input / Video Feed */}
          <div className="bg-white p-6 border border-[#2D2926]/10 shadow-sm space-y-5 rounded-none">
            <h3 className="font-serif italic text-[#2D2926] text-sm flex items-center gap-2 border-b border-[#2D2926]/10 pb-2.5">
              <Camera className="w-4 h-4 text-[#FF6321]" />
              Scanner de Validation Client
            </h3>

            {/* Manual ID fallback form */}
            <form onSubmit={handleManualSearch} className="space-y-2">
              <label className="block text-[9px] font-black text-[#2D2926]/50 uppercase tracking-widest font-mono">Recherche manuelle ou scannée</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Coller ou taper l'ID de commande Firebase"
                  value={manualOrderId}
                  onChange={(e) => setManualOrderId(e.target.value)}
                  className="flex-1 px-3 py-2.5 bg-white border border-[#2D2926]/15 text-xs text-[#2D2926] focus:outline-none focus:border-[#FF6321]"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#2D2926] hover:bg-[#FF6321] text-white text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors"
                >
                  Charger
                </button>
              </div>
            </form>

            <div className="border-t border-[#2D2926]/10 pt-4 space-y-4">
              <p className="text-[9px] text-[#2D2926]/50 font-black uppercase tracking-widest font-mono">Options de scan en direct</p>
              
              {/* Video Camera Container */}
              {cameraActive ? (
                <div className="relative overflow-hidden border border-[#2D2926]/15 bg-black aspect-video flex items-center justify-center">
                  <video 
                    ref={videoRef}
                    className="w-full h-full object-cover"
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  
                  {/* Overlay scope frame */}
                  <div className="absolute inset-0 border-[24px] border-black/40 flex items-center justify-center">
                    <div className="w-32 h-32 border-2 border-dashed border-white/80 relative">
                      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#FF6321]" />
                      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#FF6321]" />
                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#FF6321]" />
                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#FF6321]" />
                    </div>
                  </div>

                  <button
                    onClick={stopCamera}
                    className="absolute bottom-3 right-3 bg-red-600 hover:bg-red-700 text-white text-[9px] font-black uppercase tracking-widest px-3 py-2 cursor-pointer transition-colors"
                  >
                    Arrêter
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={startCamera}
                    className="p-4 bg-[#EFEDE9] hover:bg-[#EFEDE9]/70 text-[#2D2926] border border-[#2D2926]/10 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 text-center"
                  >
                    <Camera className="w-6 h-6 text-[#FF6321]" />
                    <span className="text-xs font-bold uppercase tracking-wider">Activer Caméra</span>
                    <span className="text-[9px] text-[#2D2926]/60 leading-tight">Scanner le QR du client</span>
                  </button>

                  <div className="relative p-4 bg-white hover:bg-[#EFEDE9]/30 text-[#2D2926] border border-[#2D2926]/10 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 text-center">
                    <UploadCloud className="w-6 h-6 text-[#2D2926]/70" />
                    <span className="text-xs font-bold uppercase tracking-wider">Importer Image</span>
                    <span className="text-[9px] text-[#2D2926]/60 leading-tight">Décoder une capture</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Scanned Order Details & Action */}
          <div className="bg-white p-6 border border-[#2D2926]/10 shadow-sm flex flex-col justify-between min-h-[360px] rounded-none">
            {scannedOrder ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#2D2926]/10 pb-2.5">
                  <span className="text-[10px] font-black font-mono text-[#FF6321] tracking-widest">FACTURE N° {scannedOrder.id.slice(0,8).toUpperCase()}</span>
                  <span className={`text-[9px] font-mono uppercase font-black tracking-widest px-2.5 py-0.5 border ${
                    scannedOrder.status === 'delivered' ? 'bg-green-150 border-green-300 text-green-800' : 'bg-amber-100 border-amber-300 text-amber-800'
                  }`}>
                    {scannedOrder.status === 'delivered' ? 'Livré' : 'À Livrer'}
                  </span>
                </div>

                {/* Info summary */}
                <div className="space-y-1.5 text-xs">
                  <p><span className="text-[#2D2926]/60 text-[9px] uppercase font-black tracking-widest">CLIENT :</span> <span className="font-bold text-[#2D2926]">{scannedOrder.clientName}</span></p>
                  <p><span className="text-[#2D2926]/60 text-[9px] uppercase font-black tracking-widest">CONTACT :</span> <span className="font-semibold text-[#2D2926]/80">{scannedOrder.clientPhone}</span></p>
                  <p><span className="text-[#2D2926]/60 text-[9px] uppercase font-black tracking-widest">PAIEMENT :</span> <span className="font-semibold capitalize text-[#2D2926]/80">{scannedOrder.paymentMethod} Money ({scannedOrder.paymentTxRef || 'Cash'})</span></p>
                </div>

                {/* Items */}
                <div className="bg-[#EFEDE9]/30 p-3 border border-[#2D2926]/10 max-h-32 overflow-y-auto space-y-1.5 rounded-none">
                  {scannedOrder.items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs text-[#2D2926]">
                      <span className="font-bold uppercase text-[10px] tracking-wide">{item.name} <span className="text-[#2D2926]/50 font-mono font-normal">x{item.quantity}</span></span>
                      <div className="text-right">
                        <span className="font-bold font-mono text-[#FF6321]">{item.price.toLocaleString('fr-FR')} $</span>
                        <span className="block text-[9px] text-[#2D2926]/50 font-mono">({(item.price * (settings.exchangeRate || 2850)).toLocaleString('fr-FR')} FC)</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total Solde */}
                <div className="flex justify-between items-center bg-[#EFEDE9] p-3 border border-[#2D2926]/10 rounded-none">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70">SOLDE TOTAL :</span>
                  <div className="text-right">
                    <span className="text-md font-extrabold text-[#FF6321]">{scannedOrder.total.toLocaleString('fr-FR')} $</span>
                    <span className="block text-[10px] font-bold text-[#2D2926]/50 font-mono mt-0.5">{(scannedOrder.total * (settings.exchangeRate || 2850)).toLocaleString('fr-FR')} FC</span>
                  </div>
                </div>

                {/* Action button */}
                <div className="pt-2">
                  {scannedOrder.status !== 'delivered' ? (
                    <button
                      onClick={() => handleDeliverOrder(scannedOrder.id)}
                      className="w-full py-3 bg-[#FF6321] hover:bg-[#2D2926] text-white rounded-none text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      Valider &amp; Livrer le colis au client
                    </button>
                  ) : (
                    <div className="p-3 bg-green-50 border border-green-150 text-green-800 text-xs rounded-none flex items-center gap-2 font-semibold">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span>Ce colis a déjà été livré le {new Date(scannedOrder.deliveredAt || '').toLocaleString('fr-FR')}.</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => handleDeleteOrder(scannedOrder.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 text-[9px] font-black uppercase tracking-widest flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Supprimer Commande
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 flex flex-col items-center justify-center h-full opacity-60">
                <CheckCircle className="w-10 h-10 text-[#2D2926]/30 mb-2 stroke-[1.25]" />
                <p className="text-xs text-[#2D2926] font-black uppercase tracking-widest">Prêt pour le Scan</p>
                <p className="text-[10px] text-[#2D2926]/60 mt-1 max-w-[240px] uppercase tracking-wider leading-relaxed">Une fois le code client scanné ou saisi, les détails de sa facture et son solde s'afficheront ici pour validation.</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* PRODUCTS CATALOG MANAGEMENT */}
      {adminTab === 'products' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div>
              <h3 className="text-xl font-serif italic text-[#2D2926]">Catalogue de vêtements et accessoires</h3>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#2D2926]/60 mt-1">Ajoutez de nouveaux habits ou modifiez les prix existants.</p>
            </div>
            
            <button
              onClick={() => {
                setEditingProduct(null);
                setProdName('');
                setProdPrice('');
                setProdPriceFC('');
                setProdCategory('');
                setProdDescription('');
                setProdImageUrl('');
                setImageSourceTab('upload');
                setIsProductModalOpen(true);
              }}
              className="px-5 py-3 bg-[#2D2926] hover:bg-[#FF6321] text-white rounded-none text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors shadow-sm"
            >
              Ajouter Vêtement / Accessoire
            </button>
          </div>

          {/* Table list */}
          <div className="bg-white border border-[#2D2926]/10 overflow-hidden rounded-none shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#EFEDE9] border-b border-[#2D2926]/10 text-[#2D2926] uppercase font-mono font-black tracking-widest text-[9px]">
                    <th className="p-4">Vêtement / Photo</th>
                    <th className="p-4">Catégorie</th>
                    <th className="p-4 text-right">Prix</th>
                    <th className="p-4">Description</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2D2926]/10">
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-[#2D2926]/60 font-bold uppercase tracking-wider">
                        La boutique ne contient aucun produit. Cliquez sur "Ajouter Vêtement" pour en créer un.
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => (
                      <tr key={product.id} className="hover:bg-[#EFEDE9]/20 transition-colors">
                        <td className="p-4">
                           <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#EFEDE9] border border-[#2D2926]/10 overflow-hidden rounded-none flex-shrink-0 flex items-center justify-center">
                              {product.imageUrl ? (
                                <img src={product.imageUrl} alt={product.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                              ) : (
                                <Package className="w-5 h-5 text-[#2D2926]/40" />
                              )}
                            </div>
                            <span className="font-bold text-[#2D2926] uppercase text-[11px] tracking-wide">{product.name}</span>
                          </div>
                        </td>
                        <td className="p-4 text-[#2D2926]/60 font-black tracking-widest uppercase font-mono text-[9px]">{product.category}</td>
                        <td className="p-4 text-right">
                          <div className="font-extrabold text-[#FF6321] text-sm">
                            {product.price.toLocaleString('fr-FR')} $
                          </div>
                          <div className="text-[10px] text-[#2D2926]/50 font-mono font-bold mt-0.5">
                            {(product.price * (settings.exchangeRate || 2850)).toLocaleString('fr-FR')} FC
                          </div>
                        </td>
                        <td className="p-4 text-[#2D2926]/70 max-w-xs truncate font-medium">{product.description || "—"}</td>
                        <td className="p-4 text-center">
                          <div className="flex justify-center items-center gap-2">
                            <button
                              onClick={() => handleEditProductClick(product)}
                              className="p-1.5 text-[#2D2926] hover:bg-[#EFEDE9] border border-[#2D2926]/10 rounded-none transition-colors cursor-pointer"
                              title="Modifier le prix ou l'article"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(product.id, product.name)}
                              className="p-1.5 text-red-600 hover:bg-red-50 border border-red-200 rounded-none transition-colors cursor-pointer"
                              title="Supprimer définitivement"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ORDERS LIST */}
      {adminTab === 'orders' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-serif italic text-[#2D2926]">Commandes Client reçues en temps réel</h3>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#2D2926]/60 mt-1">Consultez l'historique et gérez les étapes de validation.</p>
          </div>

          <div className="bg-white border border-[#2D2926]/10 overflow-hidden rounded-none shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#EFEDE9] border-b border-[#2D2926]/10 text-[#2D2926] uppercase font-mono font-black tracking-widest text-[9px]">
                    <th className="p-4">Commande</th>
                    <th className="p-4">Client / Tél</th>
                    <th className="p-4">Détails articles</th>
                    <th className="p-4 text-right">Total Purchases</th>
                    <th className="p-4 text-center">Statut Actuel</th>
                    <th className="p-4 text-right">Actions Gérant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2D2926]/10">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-[#2D2926]/60 font-bold uppercase tracking-wider">
                        Aucune commande n'a encore été enregistrée.
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr key={order.id} className="hover:bg-[#EFEDE9]/20 transition-colors">
                        <td className="p-4 font-mono font-bold text-[#FF6321]">{order.id.slice(0,8).toUpperCase()}</td>
                        <td className="p-4">
                          <div>
                            <p className="font-bold text-[#2D2926] uppercase">{order.clientName}</p>
                            <p className="text-[11px] text-[#2D2926]/70 mt-0.5">{order.clientPhone}</p>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="space-y-0.5 text-[#2D2926]/80 max-w-xs">
                            {order.items?.map((item, i) => (
                              <p key={i} className="truncate">
                                • {item.name} <span className="font-bold font-mono text-[10px]">x{item.quantity}</span>
                              </p>
                            ))}
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="font-extrabold text-[#FF6321] text-sm">
                            {order.total.toLocaleString('fr-FR')} $
                          </div>
                          <div className="text-[10px] text-[#2D2926]/50 font-mono font-bold mt-0.5">
                            {(order.total * (settings.exchangeRate || 2850)).toLocaleString('fr-FR')} FC
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`inline-block text-[9px] font-black px-2 py-0.5 border rounded-none uppercase tracking-wider ${
                            order.status === 'delivered' ? 'bg-green-50 border-green-300 text-green-800' :
                            order.status === 'ready' ? 'bg-blue-50 border-blue-300 text-blue-800' :
                            order.status === 'preparing' ? 'bg-amber-50 border-amber-300 text-amber-800' :
                            order.status === 'cancelled' ? 'bg-red-50 border-red-300 text-red-800' :
                            'bg-neutral-50 border-neutral-300 text-neutral-800'
                          }`}>
                            {order.status === 'pending' ? 'En attente' :
                             order.status === 'preparing' ? 'Préparation' :
                             order.status === 'ready' ? 'Prêt' :
                             order.status === 'delivered' ? 'Livré' : 'Annulé'}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1.5 flex-wrap">
                            {order.status === 'pending' && (
                              <button
                                onClick={() => handleUpdateOrderStatus(order.id, 'preparing')}
                                className="px-2 py-1.5 bg-[#EFEDE9] border border-[#2D2926]/10 text-[#2D2926] hover:bg-[#2D2926]/5 rounded-none text-[9px] font-black uppercase tracking-widest cursor-pointer transition-colors"
                              >
                                Préparer
                              </button>
                            )}
                            {order.status === 'preparing' && (
                              <button
                                onClick={() => handleUpdateOrderStatus(order.id, 'ready')}
                                className="px-2 py-1.5 bg-[#EFEDE9] border border-[#2D2926]/10 text-[#2D2926] hover:bg-[#2D2926]/5 rounded-none text-[9px] font-black uppercase tracking-widest cursor-pointer transition-colors"
                              >
                                Prêt
                              </button>
                            )}
                            {order.status !== 'delivered' && order.status !== 'cancelled' && (
                              <button
                                onClick={() => handleUpdateOrderStatus(order.id, 'delivered')}
                                className="px-2 py-1.5 bg-[#FF6321] text-white hover:bg-[#2D2926] rounded-none text-[9px] font-black uppercase tracking-widest cursor-pointer transition-colors"
                              >
                                Livrer
                              </button>
                            )}
                            {order.status !== 'delivered' && order.status !== 'cancelled' && (
                              <button
                                onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                                className="px-2 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-none text-[9px] font-black uppercase tracking-widest cursor-pointer transition-colors"
                              >
                                Annuler
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteOrder(order.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 border border-red-100 rounded-none cursor-pointer transition-colors"
                              title="Supprimer de l'historique"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS CONFIGURATION */}
      {adminTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-white p-6 border border-[#2D2926]/10 shadow-sm max-w-2xl mx-auto space-y-6 rounded-none">
          <div className="border-b border-[#EFEDE9] pb-3">
            <h3 className="font-bold text-md text-[#2D2926] flex items-center gap-1.5 uppercase font-mono tracking-wider">
              <Settings className="w-4 h-4 text-[#FF6321]" />
              Configuration Générale de la Boutique
            </h3>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#2D2926]/60 mt-1">Modifiez vos coordonnées, numéros de paiement et l'ID Administrateur.</p>
          </div>

          {/* Admin Phones Modification */}
          <div className="space-y-3 p-4 bg-[#FF6321]/5 border border-[#FF6321]/20 rounded-none">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#FF6321]" />
              <span className="text-xs font-black text-[#2D2926] uppercase font-mono tracking-wider">Sécurité : Numéros de Téléphone Gérant</span>
            </div>
            <p className="text-[11px] text-[#2D2926]/70 uppercase tracking-wide leading-relaxed font-semibold">
              Modifiez les numéros de téléphone autorisés à se connecter et piloter l'espace d'administration. 
              <span className="font-black text-[#2D2926]"> Note : Séparez les numéros par des virgules si vous en avez plusieurs. Exemple : 0998283123</span>
            </p>
            <input
              type="text"
              required
              placeholder="Ex: 0998283123, 0891234567"
              value={adminPhones}
              onChange={(e) => setAdminPhones(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 text-xs text-[#2D2926] focus:outline-none focus:border-[#FF6321] rounded-none font-mono font-medium placeholder:text-[#2D2926]/30"
            />
          </div>

          {/* Payment numbers */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-[#2D2926] uppercase tracking-widest border-b border-[#EFEDE9] pb-1.5">Numéros Mobiles de Réception de Fonds</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70 mb-1">Airtel Money *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 0998283123"
                  value={airtelMoney}
                  onChange={(e) => setAirtelMoney(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 text-xs text-[#2D2926] focus:outline-none focus:border-[#FF6321] rounded-none font-medium placeholder:text-[#2D2926]/30"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70 mb-1">Orange Money</label>
                <input
                  type="text"
                  placeholder="Ex: 0891234567"
                  value={orangeMoney}
                  onChange={(e) => setOrangeMoney(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 text-xs text-[#2D2926] focus:outline-none focus:border-[#FF6321] rounded-none font-medium placeholder:text-[#2D2926]/30"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70 mb-1">M-Pesa</label>
                <input
                  type="text"
                  placeholder="Ex: 0812345678"
                  value={mpesa}
                  onChange={(e) => setMpesa(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 text-xs text-[#2D2926] focus:outline-none focus:border-[#FF6321] rounded-none font-medium placeholder:text-[#2D2926]/30"
                />
              </div>
            </div>
          </div>

          {/* Taux de Change */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-[#2D2926] uppercase tracking-widest border-b border-[#EFEDE9] pb-1.5">Monnaie &amp; Taux de change (Franc Congolais)</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70 mb-1">Taux de change (1 $ USD = ? FC) *</label>
                <input
                  type="number"
                  required
                  placeholder="Ex: 2850"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(parseInt(e.target.value) || 2850)}
                  className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 text-xs text-[#2D2926] focus:outline-none focus:border-[#FF6321] rounded-none font-medium placeholder:text-[#2D2926]/30"
                />
              </div>
              <div className="flex items-center">
                <p className="text-[11px] text-[#2D2926]/60 dark:text-[#EFEDE9]/60 italic font-semibold sm:pt-4">
                  Ce taux est utilisé pour convertir automatiquement tous les montants en Franc Congolais (FC) à côté du Dollars ($) pour vos clients de Kinshasa.
                </p>
              </div>
            </div>
          </div>

          {/* Boutique Coordinates */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-[#2D2926] uppercase tracking-widest border-b border-[#EFEDE9] pb-1.5">Coordonnées Boutique</h4>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70 mb-1">Adresse Physique</label>
              <textarea
                rows={2}
                placeholder="Ex: Avenue Lisala N1, Ngaliema..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 text-xs text-[#2D2926] focus:outline-none focus:border-[#FF6321] rounded-none font-medium placeholder:text-[#2D2926]/30"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70 mb-1">Slogan</label>
                <input
                  type="text"
                  placeholder="Ex: Maria Business Toujours..."
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 text-xs text-[#2D2926] focus:outline-none focus:border-[#FF6321] rounded-none font-medium placeholder:text-[#2D2926]/30"
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70 mb-1">Facebook</label>
                <input
                  type="text"
                  placeholder="Nom de la page"
                  value={facebook}
                  onChange={(e) => setFacebook(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 text-xs text-[#2D2926] focus:outline-none focus:border-[#FF6321] rounded-none font-medium placeholder:text-[#2D2926]/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70 mb-1">Instagram</label>
                <input
                  type="text"
                  placeholder="Pseudo Instagram"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 text-xs text-[#2D2926] focus:outline-none focus:border-[#FF6321] rounded-none font-medium placeholder:text-[#2D2926]/30"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70 mb-1">TikTok</label>
                <input
                  type="text"
                  placeholder="Compte TikTok"
                  value={tiktok}
                  onChange={(e) => setTiktok(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 text-xs text-[#2D2926] focus:outline-none focus:border-[#FF6321] rounded-none font-medium placeholder:text-[#2D2926]/30"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#EFEDE9] flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-6 py-3 bg-[#FF6321] hover:bg-[#2D2926] text-white rounded-none text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {savingSettings ? 'Sauvegarde en cours...' : 'Enregistrer les Paramètres'}
            </button>
          </div>
        </form>
      )}

      {/* PRODUCT CREATION/EDITION MODAL DIALOG */}
      <AnimatePresence>
        {isProductModalOpen && (
          <div className="fixed inset-0 bg-[#2D2926]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-[#2D2926]/15 max-w-md w-full overflow-hidden shadow-2xl rounded-none"
            >
              <div className="bg-[#EFEDE9] p-5 border-b border-[#2D2926]/10 flex justify-between items-center rounded-none">
                <h4 className="font-serif italic text-[#2D2926] text-sm">
                  {editingProduct ? 'Modifier l\'article' : 'Ajouter un nouvel article'}
                </h4>
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="p-1 hover:bg-[#EFEDE9] rounded-none transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4 text-[#2D2926]" />
                </button>
              </div>

              <form onSubmit={handleProductSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70 mb-1">Nom du Vêtement / Accessoire *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Robe d'Été Terracotta"
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 focus:outline-none focus:border-[#FF6321] text-xs text-[#2D2926] rounded-none font-medium placeholder:text-[#2D2926]/30"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70 mb-1">Prix ($ USD) *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="Ex: 45"
                      value={prodPrice}
                      onChange={(e) => {
                        const val = e.target.value;
                        setProdPrice(val);
                        const rate = settings.exchangeRate || 2850;
                        if (val && !isNaN(parseFloat(val))) {
                          setProdPriceFC(Math.round(parseFloat(val) * rate).toString());
                        } else {
                          setProdPriceFC('');
                        }
                      }}
                      className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 focus:outline-none focus:border-[#FF6321] text-xs text-[#2D2926] rounded-none font-medium placeholder:text-[#2D2926]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70 mb-1">Prix (FC)</label>
                    <input
                      type="number"
                      placeholder="S'auto-convertit"
                      value={prodPriceFC}
                      onChange={(e) => {
                        const val = e.target.value;
                        setProdPriceFC(val);
                        const rate = settings.exchangeRate || 2850;
                        if (val && !isNaN(parseFloat(val))) {
                          setProdPrice((parseFloat(val) / rate).toFixed(2).replace(/\.00$/, ''));
                        } else {
                          setProdPrice('');
                        }
                      }}
                      className="w-full px-3 py-2.5 bg-[#EFEDE9]/40 border border-[#2D2926]/15 focus:outline-none focus:border-[#FF6321] text-xs text-[#2D2926] rounded-none font-medium placeholder:text-[#2D2926]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70 mb-1">Catégorie *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Robes, Vestes"
                      value={prodCategory}
                      onChange={(e) => setProdCategory(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 focus:outline-none focus:border-[#FF6321] text-xs text-[#2D2926] rounded-none font-medium placeholder:text-[#2D2926]/30"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70">
                    Image de l'article *
                  </label>
                  
                  {/* Tab Selector */}
                  <div className="flex border border-[#2D2926]/15 text-[10px] font-bold uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => {
                        setImageSourceTab('upload');
                      }}
                      className={`flex-1 py-2 text-center border-r border-[#2D2926]/15 transition-colors ${
                        imageSourceTab === 'upload'
                          ? 'bg-[#2D2926] text-white'
                          : 'bg-[#EFEDE9]/40 text-[#2D2926]/60 hover:bg-[#EFEDE9]'
                      }`}
                    >
                      Galerie d'images
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImageSourceTab('url');
                      }}
                      className={`flex-1 py-2 text-center transition-colors ${
                        imageSourceTab === 'url'
                          ? 'bg-[#2D2926] text-white'
                          : 'bg-[#EFEDE9]/40 text-[#2D2926]/60 hover:bg-[#EFEDE9]'
                      }`}
                    >
                      Lien URL
                    </button>
                  </div>

                  {/* Tab Content */}
                  {imageSourceTab === 'upload' ? (
                    <div className="space-y-2">
                      {prodImageUrl && !prodImageUrl.startsWith('http') ? (
                        <div className="relative border border-[#2D2926]/15 p-2 bg-[#EFEDE9]/20 flex items-center gap-3">
                          <img
                            src={prodImageUrl}
                            alt="Aperçu"
                            className="w-16 h-16 object-cover border border-[#2D2926]/10"
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-[#2D2926] truncate">Image importée</p>
                            <p className="text-[9px] text-[#2D2926]/50 uppercase font-mono tracking-wider">Format : Base64 optimisé</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setProdImageUrl('')}
                            className="p-1.5 border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                            title="Supprimer l'image"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <label 
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={async (e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files?.[0];
                            if (file) await processAndSetProductImage(file);
                          }}
                          className="flex flex-col items-center justify-center border border-dashed border-[#2D2926]/20 bg-[#EFEDE9]/10 hover:bg-[#EFEDE9]/30 py-6 px-4 text-center cursor-pointer transition-colors relative min-h-[110px]"
                        >
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleProductImageFileChange}
                            className="hidden"
                            disabled={isProcessingImage}
                          />
                          {isProcessingImage ? (
                            <div className="flex flex-col items-center space-y-2">
                              <RefreshCw className="w-5 h-5 text-[#FF6321] animate-spin" />
                              <p className="text-[10px] font-black uppercase tracking-widest text-[#FF6321]">
                                Traitement en cours...
                              </p>
                            </div>
                          ) : (
                            <>
                              <UploadCloud className="w-6 h-6 text-[#2D2926]/40 mb-1.5" />
                              <p className="text-[9px] font-black uppercase tracking-widest text-[#2D2926]">
                                Téléverser depuis la galerie
                              </p>
                              <p className="text-[8px] text-[#2D2926]/50 mt-0.5">
                                Cliquez pour sélectionner ou glissez l'image
                              </p>
                            </>
                          )}
                        </label>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="url"
                        placeholder="https://images.unsplash.com/photo-..."
                        value={prodImageUrl}
                        onChange={(e) => setProdImageUrl(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 focus:outline-none focus:border-[#FF6321] text-xs text-[#2D2926] rounded-none font-medium placeholder:text-[#2D2926]/30"
                      />
                      {prodImageUrl && (prodImageUrl.startsWith('http://') || prodImageUrl.startsWith('https://')) && (
                        <div className="relative border border-[#2D2926]/15 p-2 bg-[#EFEDE9]/20 flex items-center gap-3">
                          <img
                            src={prodImageUrl}
                            alt="Aperçu URL"
                            className="w-16 h-16 object-cover border border-[#2D2926]/10"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=300';
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-[#2D2926] truncate">{prodImageUrl}</p>
                            <p className="text-[9px] text-green-600 uppercase font-mono tracking-wider">Aperçu du lien web</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setProdImageUrl('')}
                            className="p-1.5 border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                            title="Supprimer l'adresse de l'image"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#2D2926]/70 mb-1">Description</label>
                  <textarea
                    rows={3}
                    placeholder="Décrivez les tailles disponibles, matières de fabrication, etc."
                    value={prodDescription}
                    onChange={(e) => setProdDescription(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-[#2D2926]/15 focus:outline-none focus:border-[#FF6321] text-xs text-[#2D2926] rounded-none font-medium placeholder:text-[#2D2926]/30"
                  />
                </div>

                <div className="pt-4 border-t border-[#EFEDE9] flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsProductModalOpen(false)}
                    className="flex-1 py-3 border border-[#2D2926]/20 text-[#2D2926] hover:bg-[#EFEDE9] rounded-none text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={savingProduct}
                    className="flex-1 py-3 bg-[#FF6321] hover:bg-[#2D2926] text-white rounded-none text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    {savingProduct ? 'Enregistrement...' : 'Enregistrer'}
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
