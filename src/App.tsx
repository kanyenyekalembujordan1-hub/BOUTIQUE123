/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingBag, 
  UserCheck, 
  MapPin, 
  Phone, 
  Compass, 
  LogIn, 
  LogOut, 
  Sparkles,
  Facebook,
  Instagram,
  Heart,
  RefreshCw,
  Sun,
  Moon
} from 'lucide-react';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { db, auth, googleProvider, handleFirestoreError, OperationType } from './lib/firebase';
import { Product, Order, ShopSettings } from './types';
import ClientShop from './components/ClientShop';
import AdminPanel from './components/AdminPanel';
import Toast from './components/Toast';

const DEFAULT_SETTINGS: ShopSettings = {
  adminEmail: 'kanyenyekalembujordan1@gmail.com',
  airtelMoney: '0998283123',
  orangeMoney: '0891234567',
  mpesa: '0812345678',
  address: 'Avenue Lisala N1, Commune Ngaliema, Quartier Maman Yemo. Référence: Arrêt Malueka Pompage',
  slogan: 'MARIA BUSINESS MARIA TOUJOURS HMM BONGO NDE',
  facebook: 'MARIA BUSINESS',
  instagram: 'MARIA BUSINESS',
  tiktok: 'MARIA BOUTIQUE',
  exchangeRate: 2850
};

const DEFAULT_PRODUCTS = [
  {
    name: "Robe d'Été Terracotta",
    price: 45,
    category: "Robes",
    description: "Robe longue fluide en lin naturel de couleur terracotta, idéale pour les journées chaudes.",
    imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?q=80&w=400"
  },
  {
    name: "Veste en Lin Sage",
    price: 65,
    category: "Vestes",
    description: "Veste légère non doublée de couleur olive/sauge, coupe décontractée chic.",
    imageUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=400"
  },
  {
    name: "Chapeau de Paille Malueka",
    price: 15,
    category: "Accessoires",
    description: "Chapeau de soleil tressé à la main, protection élégante contre les rayons du soleil.",
    imageUrl: "https://images.unsplash.com/photo-1533461502717-8354648407a9?q=80&w=400"
  },
  {
    name: "Chemise Coton Sablé",
    price: 35,
    category: "Chemises",
    description: "Chemise respirante en coton sablé biologique avec boutons en noix de coco.",
    imageUrl: "https://images.unsplash.com/photo-1620012253295-c05518e99309?q=80&w=400"
  },
  {
    name: "Sac Cabas Pompage",
    price: 25,
    category: "Accessoires",
    description: "Sac fourre-tout spacieux en toile naturelle de jute avec garnitures en lin.",
    imageUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=400"
  },
  {
    name: "Pantalon Cargo Maman Yemo",
    price: 40,
    category: "Pantalons",
    description: "Pantalon cargo en sergé de coton beige robuste avec poches cargo latérales spacieuses.",
    imageUrl: "https://images.unsplash.com/photo-1517445312882-bc9910d016b7?q=80&w=400"
  }
];

export default function App() {
  const [activePortal, setActivePortal] = useState<'client' | 'admin'>('client');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('boutique_pop_chop_theme') === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('boutique_pop_chop_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('boutique_pop_chop_theme', 'light');
    }
  }, [isDarkMode]);

  // Notifications State
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // 1. Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return unsubscribe;
  }, []);

  // 2. Fetch general settings, products, and orders from Firestore
  useEffect(() => {
    setLoading(true);

    // Dynamic Shop Settings Listener
    const settingsRef = doc(db, 'settings', 'shop_config');
    const unsubscribeSettings = onSnapshot(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as ShopSettings);
      } else {
        // Fallback to defaults without writing anonymously
        setSettings(DEFAULT_SETTINGS);
      }
    }, (error) => {
      console.error("Could not read settings from Firestore", error);
    });

    // Products Realtime Sync Listener
    const productsQuery = query(collection(db, 'products'));
    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      const prodsList: Product[] = [];
      snapshot.forEach(docSnap => {
        prodsList.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });

      if (prodsList.length > 0) {
        setProducts(prodsList.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        }));
      } else {
        setProducts([]);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    // Orders Realtime Sync Listener
    const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const ordsList: Order[] = [];
      snapshot.forEach(docSnap => {
        ordsList.push({ id: docSnap.id, ...docSnap.data() } as Order);
      });
      setOrders(ordsList);
      setLoading(false);
    }, (error) => {
      console.error("Could not sync orders (this is expected for non-admins as per security rules)", error);
      setLoading(false);
    });

    return () => {
      unsubscribeSettings();
      unsubscribeProducts();
      unsubscribeOrders();
    };
  }, []);

  // 3. Admin-only automatic initialization & seeding of default data
  useEffect(() => {
    if (!currentUser || loading) return;

    const checkAndSeedDatabase = async () => {
      // Check if logged-in user is actually an admin
      const userEmail = currentUser.email?.toLowerCase();
      const authorizedEmails = [
        'kanyenyekalembujordan1@gmail.com',
        settings.adminEmail.toLowerCase()
      ];
      const isAdmin = userEmail ? authorizedEmails.includes(userEmail) : false;

      if (!isAdmin) return;

      try {
        // A. Seed settings if missing
        const settingsRef = doc(db, 'settings', 'shop_config');
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) {
          await setDoc(settingsRef, DEFAULT_SETTINGS);
          showToast("Paramètres de la boutique initialisés !", "success");
        }

        // B. Seed products if empty
        if (products.length === 0) {
          showToast("Création du catalogue initial en cours...", "info");
          for (const prod of DEFAULT_PRODUCTS) {
            const productWithTime = {
              ...prod,
              createdAt: new Date().toISOString()
            };
            await addDoc(collection(db, 'products'), productWithTime);
          }
          showToast("Catalogue de prêt-à-porter initialisé !", "success");
        }
      } catch (err) {
        console.error("Erreur durant l'initialisation de la base de données :", err);
        showToast("Erreur d'initialisation de la base de données.", "error");
      }
    };

    checkAndSeedDatabase();
  }, [currentUser, products.length, loading, settings.adminEmail]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast("Connexion Google réussie !", "success");
    } catch (err) {
      console.error("Login failed", err);
      showToast("La connexion a échoué. Veuillez réessayer.", "error");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setActivePortal('client');
      showToast("Vous avez été déconnecté.", "info");
    } catch (err) {
      showToast("Échec de la déconnexion", "error");
    }
  };

  // Determine if the current logged-in user is an authorized admin
  const isUserAdmin = () => {
    if (!currentUser) return false;
    const userEmail = currentUser.email?.toLowerCase();
    
    // Check against dynamically saved settings email, or fallback to the requested default admin
    const authorizedEmails = [
      'kanyenyekalembujordan1@gmail.com',
      settings.adminEmail.toLowerCase()
    ];
    
    return userEmail ? authorizedEmails.includes(userEmail) : false;
  };

  return (
    <div className="min-h-screen bg-[#F7F3F0] dark:bg-[#181615] text-[#2D2926] dark:text-[#EFEDE9] font-sans flex flex-col transition-colors duration-300 selection:bg-[#FF6321]/20 selection:text-[#FF6321]">
      
      {/* Toast notifications portal */}
      <div className="fixed bottom-5 right-5 z-50 pointer-events-none flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map(toast => (
            <Toast 
              key={toast.id}
              message={toast.message}
              type={toast.type}
              onClose={() => removeToast(toast.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Elegant Header - Artistic Flair */}
      <header className="bg-white/80 dark:bg-[#201D1A]/80 backdrop-blur-md border-b border-[#2D2926]/10 dark:border-white/10 relative overflow-hidden">
        {/* Subtle geometric grid background accent */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#FF6321]/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#2D2926]/5 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 py-8 md:py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative z-10">
          
          {/* Shop branding */}
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2 h-2 bg-[#FF6321]" />
              <span className="text-[10px] uppercase tracking-[0.25em] font-black text-[#2D2926]/60 dark:text-[#EFEDE9]/60 font-mono">Boutique de Mode &amp; Accessoires</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-black text-[#2D2926] dark:text-white tracking-tighter uppercase leading-none">
              Boutique POP CHOP
            </h1>

            <p className="text-[11px] font-bold text-[#FF6321] tracking-[0.2em] uppercase mt-2.5 italic">
              {settings.slogan}
            </p>
          </div>

          {/* Quick shop metadata details */}
          <div className="flex flex-col sm:flex-row items-start md:items-end justify-center gap-y-2 gap-x-6 text-[11px] font-bold tracking-widest uppercase text-[#2D2926]/70 dark:text-[#EFEDE9]/70">
            <span className="flex items-center gap-1.5 border-l border-[#2D2926]/20 dark:border-white/20 pl-4">
              <MapPin className="w-4 h-4 text-[#FF6321]" />
              Ngaliema, Arrêt Malueka Pompage
            </span>
            <span className="flex items-center gap-1.5 border-l border-[#2D2926]/20 dark:border-white/20 pl-4">
              <Phone className="w-4 h-4 text-[#2D2926] dark:text-[#EFEDE9]" />
              Airtel Money: {settings.airtelMoney || '0998283123'}
            </span>
          </div>

        </div>

        {/* Global Navigation bar: Client Shop vs Espace Gérant */}
        <div className="bg-[#EFEDE9]/60 dark:bg-[#201D1A]/60 border-t border-[#2D2926]/10 dark:border-white/10 py-3 px-6">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs">
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActivePortal('client')}
                className={`px-4 py-2 border uppercase tracking-widest text-[10px] font-black transition-all cursor-pointer flex items-center gap-2 ${
                  activePortal === 'client' 
                    ? 'bg-[#2D2926] text-white border-[#2D2926] dark:bg-[#EFEDE9] dark:text-[#2D2926] dark:border-[#EFEDE9]' 
                    : 'text-[#2D2926] dark:text-[#EFEDE9] border-transparent hover:bg-[#2D2926]/5 dark:hover:bg-white/5'
                }`}
              >
                <Compass className="w-4 h-4" />
                Acheter des Vêtements
              </button>
              
              <button
                onClick={() => setActivePortal('admin')}
                className={`px-4 py-2 border uppercase tracking-widest text-[10px] font-black transition-all cursor-pointer flex items-center gap-2 ${
                  activePortal === 'admin' 
                    ? 'bg-[#2D2926] text-white border-[#2D2926] dark:bg-[#EFEDE9] dark:text-[#2D2926] dark:border-[#EFEDE9]' 
                    : 'text-[#2D2926] dark:text-[#EFEDE9] border-transparent hover:bg-[#2D2926]/5 dark:hover:bg-white/5'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                Espace Gérant
              </button>
            </div>

            {/* Theme Toggle & Authentication widgets */}
            <div className="flex items-center gap-3">
              {/* Theme Toggle Button */}
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 py-2 px-3 bg-white dark:bg-[#26211E] hover:bg-[#EFEDE9] dark:hover:bg-white/5 text-[#2D2926] dark:text-[#EFEDE9] border border-[#2D2926]/15 dark:border-white/10 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                title={isDarkMode ? "Passer en mode clair" : "Passer en mode sombre"}
              >
                {isDarkMode ? (
                  <>
                    <Sun className="w-4 h-4 text-amber-500 fill-amber-500/20" />
                    <span className="text-[9px] uppercase tracking-wider font-bold">Clair</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4 text-[#2D2926]" />
                    <span className="text-[9px] uppercase tracking-wider font-bold">Sombre</span>
                  </>
                )}
              </button>

              {/* Google Authentication widget */}
              {currentUser ? (
                <div className="flex items-center gap-3 bg-white dark:bg-[#26211E] px-4 py-2 border border-[#2D2926]/10 dark:border-white/10">
                  <span className="text-[11px] font-bold text-[#2D2926] dark:text-[#EFEDE9] hidden sm:inline">
                    {currentUser.displayName || currentUser.email}
                  </span>
                  {isUserAdmin() && (
                    <span className="bg-[#FF6321] text-white text-[9px] px-2 py-0.5 font-bold uppercase font-mono">
                      Gérant Admin
                    </span>
                  )}
                  <button
                    onClick={handleLogout}
                    className="text-[#2D2926]/60 dark:text-[#EFEDE9]/60 hover:text-[#FF6321] font-black text-[10px] uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
                  >
                    <LogOut className="w-4 h-4" />
                    Déconnexion
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleLogin}
                  className="bg-white dark:bg-[#26211E] hover:bg-[#2D2926] dark:hover:bg-[#EFEDE9] hover:text-white dark:hover:text-[#2D2926] text-[#2D2926] dark:text-[#EFEDE9] border border-[#2D2926] dark:border-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4 text-[#FF6321]" />
                  Connexion Gérant (Google)
                </button>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 relative">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <RefreshCw className="w-8 h-8 text-[#C15C3D] animate-spin mb-3" />
            <p className="text-sm text-[#8A7E72] font-medium">Synchronisation sécurisée de la Boutique POP CHOP...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            
            {/* PORTAL 1: CLIENT PORTAL */}
            {activePortal === 'client' && (
              <motion.div
                key="client"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
              >
                <ClientShop 
                  settings={settings}
                  products={products}
                  showToast={showToast}
                />
              </motion.div>
            )}

            {/* PORTAL 2: ADMINISTRATOR CONTROL PANEL */}
            {activePortal === 'admin' && (
              <motion.div
                key="admin"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
              >
                {/* Authorization check */}
                {isUserAdmin() ? (
                  <AdminPanel 
                    settings={settings}
                    products={products}
                    orders={orders}
                    onSettingsUpdate={(newS) => setSettings(newS)}
                    showToast={showToast}
                  />
                ) : (
                  <div className="max-w-md mx-auto py-12 text-center bg-white border border-[#2D2926]/10 p-8 space-y-6 shadow-sm">
                    <UserCheck className="w-12 h-12 text-[#FF6321] mx-auto stroke-[1]" />
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-[#2D2926]">Accès Réservé au Gérant</h3>
                      <p className="text-[11px] font-semibold text-[#2D2926]/60 mt-2 leading-relaxed">
                        Cette section requiert de se connecter avec un compte Google habilité. 
                        L'identifiant gérant configuré est : <span className="font-bold text-[#2D2926] font-mono select-all bg-[#EFEDE9] px-2 py-0.5 rounded border border-[#2D2926]/5">{settings.adminEmail}</span>
                      </p>
                    </div>

                    {!currentUser ? (
                      <button
                        onClick={handleLogin}
                        className="w-full py-3 bg-[#2D2926] hover:bg-[#FF6321] text-white transition-all text-xs font-black uppercase tracking-widest cursor-pointer shadow-sm"
                      >
                        Se connecter avec Google
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-800 font-bold uppercase tracking-wider">
                          Votre email ({currentUser.email}) n'est pas autorisé.
                        </div>
                        <button
                          onClick={handleLogout}
                          className="w-full py-3 border border-[#2D2926] text-[#2D2926] hover:bg-[#2D2926]/5 text-xs font-black uppercase tracking-widest cursor-pointer transition-colors"
                        >
                          Se connecter avec un autre compte
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        )}
      </main>

      {/* Crafted Footer - Artistic Flair */}
      <footer className="bg-white dark:bg-[#201D1A] text-[#2D2926] dark:text-[#EFEDE9] border-t border-[#2D2926]/10 dark:border-white/10 pt-12 pb-8 mt-12 relative overflow-hidden transition-colors duration-300">
        {/* Minimal decor elements */}
        <div className="absolute left-0 bottom-0 w-48 h-48 bg-[#FF6321]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left text-xs text-[#2D2926]/70 dark:text-[#EFEDE9]/70 relative z-10">
          
          {/* Brand/Slogan column */}
          <div className="space-y-3 border-r border-[#2D2926]/5 dark:border-white/5 pr-4">
            <h4 className="font-black text-[#2D2926] dark:text-white text-sm uppercase tracking-widest font-mono">Boutique POP CHOP</h4>
            <p className="italic font-serif text-sm text-[#FF6321] font-bold">"{settings.slogan}"</p>
            <p className="leading-relaxed text-[11px]">Maria Business Maria Toujours hmm Bongo Nde ! Retrouvez nos collections de prêt-à-porter exclusifs à Kinshasa.</p>
          </div>

          {/* Location / Address column */}
          <div className="space-y-3 border-r border-[#2D2926]/5 dark:border-white/5 px-0 md:px-4">
            <h4 className="font-black text-[#2D2926] dark:text-white text-sm uppercase tracking-widest font-mono">Notre adresse</h4>
            <div className="space-y-1 text-[11px]">
              <p className="flex items-center justify-center md:justify-start gap-1.5 font-bold">
                <MapPin className="w-4 h-4 text-[#FF6321]" />
                <span>{settings.address}</span>
              </p>
              <p className="pl-5">Ngaliema, Quartier Maman Yemo</p>
              <p className="pl-5 text-[#FF6321] font-black uppercase tracking-wider text-[10px]">Référence : Arrêt Malueka Pompage</p>
            </div>
          </div>

          {/* Social connections column */}
          <div className="space-y-3 pl-0 md:pl-4">
            <h4 className="font-black text-[#2D2926] dark:text-white text-sm uppercase tracking-widest font-mono">Réseaux sociaux</h4>
            <p className="text-[11px]">Suivez nos arrivages hebdomadaires en direct :</p>
            <div className="flex justify-center md:justify-start gap-4 pt-1">
              {settings.facebook && (
                <a 
                  href={`https://facebook.com/${settings.facebook}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-[#FF6321] transition-colors font-bold uppercase tracking-wider text-[10px]"
                >
                  <Facebook className="w-4 h-4 text-[#FF6321]" />
                  <span>Facebook</span>
                </a>
              )}
              {settings.instagram && (
                <a 
                  href={`https://instagram.com/${settings.instagram}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-[#FF6321] transition-colors font-bold uppercase tracking-wider text-[10px]"
                >
                  <Instagram className="w-4 h-4 text-[#FF6321]" />
                  <span>Instagram</span>
                </a>
              )}
              {settings.tiktok && (
                <a 
                  href={`https://tiktok.com/@${settings.tiktok}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-[#FF6321] transition-colors font-bold uppercase tracking-wider text-[10px]"
                >
                  <span className="font-mono text-[#FF6321] font-black text-xs">𝅘𝅥𝅮</span>
                  <span>TikTok</span>
                </a>
              )}
            </div>
          </div>

        </div>

        {/* Sponsor/Partner Logos Banner */}
        <div className="max-w-4xl mx-auto px-6 mt-12 mb-2 text-center relative z-10">
          <p className="text-[9px] uppercase tracking-[0.25em] font-black text-[#2D2926]/40 dark:text-[#EFEDE9]/40 mb-3 font-mono">
            Sponsors Officiels &amp; Partenaires
          </p>
          <div className="flex justify-center">
            <img 
              src="/src/assets/images/sponsor_logos_banner_1784270809329.jpg" 
              alt="Sponsors: Coca-Cola, Bavaria, Maria, Pop Shop" 
              className="max-h-24 md:max-h-28 w-auto object-contain hover:scale-[1.01] transition-transform duration-300 border border-[#2D2926]/10 dark:border-white/10 rounded-md shadow-xs bg-stone-900"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        {/* Base copyright bar */}
        <div className="max-w-6xl mx-auto px-6 mt-8 pt-6 border-t border-[#2D2926]/10 dark:border-white/10 text-center text-[10px] text-[#2D2926]/50 dark:text-[#EFEDE9]/50 uppercase tracking-widest font-bold relative z-10">
          <p>© 2026 Maria Business - Boutique Pop Chop. Tous droits réservés. Kinshasa, RDC.</p>
          <p className="mt-1.5 flex items-center justify-center gap-1">
            Fait avec <Heart className="w-3 h-3 text-[#FF6321] fill-[#FF6321]" /> pour MARIA BUSINESS.
          </p>
        </div>
      </footer>

    </div>
  );
}
