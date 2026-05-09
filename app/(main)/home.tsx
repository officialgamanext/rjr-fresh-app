import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  TextInput,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Image } from 'react-native';
import { db } from '../../config/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp, 
  writeBatch, 
  doc,
  updateDoc,
  increment,
  getDoc,
  setDoc,
  orderBy,
  limit,
} from 'firebase/firestore';

const COLLECTIONS = {
  USERS: 'users',
  STORES: 'stores',
  CHECKINS: 'checkins',
  ORDERS: 'orders',
  RETURNS: 'returns',
  PAYMENTS: 'payments',
  ITEMS: 'items',
  BATCHES: 'batches',
};
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');

// Haversine formula to calculate distance between two points in metres
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export default function MainScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [employee, setEmployee] = useState<any>(null);
  const [currentCheckIn, setCurrentCheckIn] = useState<any>(null);
  const [nearestShops, setNearestShops] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadingShops, setLoadingShops] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [isInitialCheckDone, setIsInitialCheckDone] = useState(false);

  // Sale Order States
  const [isSaleOrderModalOpen, setIsSaleOrderModalOpen] = useState(false);
  const [priceListItems, setPriceListItems] = useState<any[]>([]);
  const [cart, setCart] = useState<{ [key: string]: number }>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [discount, setDiscount] = useState('0');
  const [returnAmount, setReturnAmount] = useState('0');
  const [receivedAmount, setReceivedAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [useCredit, setUseCredit] = useState(false);
  const [shopDetails, setShopDetails] = useState<any>(null);
  const [isSummaryFlyoutOpen, setIsSummaryFlyoutOpen] = useState(false);
  const [batches, setBatches] = useState<any[]>([]);
  const [orderStatus, setOrderStatus] = useState('Ordered');
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [batchPickerVisible, setBatchPickerVisible] = useState(false);
  const [selectedItemForBatch, setSelectedItemForBatch] = useState<string | null>(null);

  const [overviewStats, setOverviewStats] = useState({
    totalSales: 0,
    orderCount: 0,
    payments: 0,
    returns: 0
  });

  // Fetch employee details on mount
  useEffect(() => {
    const fetchEmployee = async () => {
      if (!user?.email) return;
      try {
        const username = user.email.split('@')[0].toLowerCase();
        console.log(`Home: Fetching employee details for username: ${username}`);
        
        const q = query(collection(db, COLLECTIONS.USERS), where('username', '==', username));
        const snap = await getDocs(q);
        
        let empData: any = null;
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          empData = { ...docSnap.data(), id: docSnap.id };
        } else {
          console.warn('Home: No employee document found for username:', username);
          const qUid = query(collection(db, COLLECTIONS.USERS), where('uid', '==', user.uid));
          const snapUid = await getDocs(qUid);
          if (!snapUid.empty) {
            const docSnapUid = snapUid.docs[0];
            empData = { ...docSnapUid.data(), id: docSnapUid.id };
          } else {
            const qAuthUid = query(collection(db, COLLECTIONS.USERS), where('authUid', '==', user.uid));
            const snapAuthUid = await getDocs(qAuthUid);
            if (!snapAuthUid.empty) {
              const docSnapAuthUid = snapAuthUid.docs[0];
              empData = { ...docSnapAuthUid.data(), id: docSnapAuthUid.id };
            }
          }
        }
        
        if (empData) {
          setEmployee(empData);
          fetchTodayStats(empData.id);
        }
      } catch (err) {
        console.error('Home: Error fetching employee details:', err);
      }
    };
    fetchEmployee();
    fetchBatches();
  }, [user]);

  const fetchTodayStats = async (empId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch today's orders for this employee
      const qOrders = query(
        collection(db, 'orders'),
        where('employeeId', '==', empId)
      );
      const snapOrders = await getDocs(qOrders);
      
      let totalSales = 0;
      let orderCount = 0;
      snapOrders.forEach(doc => {
        const d = doc.data();
        const orderDate = d.createdAt?.toDate ? d.createdAt.toDate().toISOString().split('T')[0] : (typeof d.createdAt === 'string' ? d.createdAt.split('T')[0] : '');
        if (orderDate === today && d.status !== 'Cancelled') {
          totalSales += (parseFloat(d.grandTotal || d.netPayable) || 0);
          orderCount++;
        }
      });

      // Fetch today's payments for this employee
      const qPayments = query(
        collection(db, 'payments'),
        where('employeeId', '==', empId)
      );
      const snapPayments = await getDocs(qPayments);
      let totalPayments = 0;
      snapPayments.forEach(doc => {
        const d = doc.data();
        if (d.date === today) {
          totalPayments += (parseFloat(d.amount) || 0);
        }
      });

      setOverviewStats({
        totalSales,
        orderCount,
        payments: totalPayments,
        returns: 0 // Will implement returns tally if collection exists
      });
    } catch (error) {
      console.error("Home: Error fetching today's stats:", error);
    }
  };

  const fetchBatches = async () => {
    try {
      const q = query(collection(db, COLLECTIONS.BATCHES), orderBy('createdAt', 'desc'), limit(15));
      const snap = await getDocs(q);
      const batchList: any[] = [];
      snap.forEach(doc => batchList.push({ id: doc.id, ...doc.data() }));
      setBatches(batchList);
    } catch (error) {
      console.error("Home: Error fetching batches:", error);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            await logout();
          } catch (error) {
            setLoggingOut(false);
            Alert.alert('Error', 'Logout failed. Please try again.');
          }
        },
      },
    ]);
  };

  const handleCheckInPress = async () => {
    setCheckingIn(true);
    try {
      // Ensure employee details are available for location filtering
      let currentEmployee = employee;
      if (!currentEmployee && user?.email) {
        const username = user.email.split('@')[0].toLowerCase();
        const qEmp = query(collection(db, COLLECTIONS.USERS), where('username', '==', username));
        const empSnap = await getDocs(qEmp);
        if (!empSnap.empty) {
          currentEmployee = { ...empSnap.docs[0].data(), id: empSnap.docs[0].id };
          setEmployee(currentEmployee);
        }
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is required for Check-In.');
        setCheckingIn(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude } = location.coords;
      setUserLocation({ latitude, longitude });
      console.log(`Current User Location: Lat ${latitude}, Lon ${longitude}`);

      setLoadingShops(true);
      
      // Filter stores by employee's assigned locationId
      let shopsQuery;
      if (currentEmployee?.locationId) {
        console.log(`Home: Filtering stores for location: ${currentEmployee.locationName || currentEmployee.locationId}`);
        shopsQuery = query(collection(db, COLLECTIONS.STORES), where('locationId', '==', currentEmployee.locationId));
      } else {
        shopsQuery = collection(db, COLLECTIONS.STORES);
      }

      const shopsSnap = await getDocs(shopsQuery);
      const allShops: any[] = [];
      
      console.log(`Total shops found for location: ${shopsSnap.size}`);

      shopsSnap.forEach((doc) => {
        const data = doc.data();
        // Admin Panel uses 'lat' and 'lng'. Mobile app might have used 'latitude' and 'longitude'.
        const shopLatVal = data.lat || data.latitude;
        const shopLonVal = data.lng || data.longitude;

        if (shopLatVal && shopLonVal) {
          const shopLat = parseFloat(shopLatVal);
          const shopLon = parseFloat(shopLonVal);
          
          if (!isNaN(shopLat) && !isNaN(shopLon)) {
            const dist = getDistance(latitude, longitude, shopLat, shopLon);
            // Only show shops within 100m
            if (dist <= 100) {
              allShops.push({ id: doc.id, ...data, distance: dist });
            }
          }
        }
      });

      if (allShops.length === 0) {
        Alert.alert('No Shops Found', 'There are no shops within 100 meters of your current location.');
        setCheckingIn(false);
        setLoadingShops(false);
        return;
      }

      setNearestShops(allShops);
      setIsModalOpen(true);
    } catch (error) {
      console.error('Check-in error:', error);
      Alert.alert('Error', 'Failed to fetch location or shops.');
    } finally {
      setCheckingIn(false);
      setLoadingShops(false);
    }
  };

  // Check for existing check-in today on mount
  useEffect(() => {
    const checkStatus = async () => {
      if (!user?.uid || isInitialCheckDone) return;
      
      try {
        console.log('Home: Checking today\'s check-in status...');
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const q = query(
          collection(db, COLLECTIONS.CHECKINS),
          where('userId', '==', user.uid),
          where('date', '==', today)
        );
        const snap = await getDocs(q);
        
        if (!snap.empty) {
          // Sort locally to avoid index requirement
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          docs.sort((a: any, b: any) => {
            const timeA = a.timestamp?.seconds || 0;
            const timeB = b.timestamp?.seconds || 0;
            return timeB - timeA;
          });
          
          const lastCheckIn = docs[0];
          console.log('Home: Found active check-in for today:', lastCheckIn.shopName);
          setCurrentCheckIn(lastCheckIn);
          setIsInitialCheckDone(true);
        } else {
          console.log('Home: No check-in found for today. Triggering location flow...');
          setIsInitialCheckDone(true);
          handleCheckInPress();
        }
      } catch (err) {
        console.error('Home: Error checking check-in status:', err);
        setIsInitialCheckDone(true);
      }
    };

    if (user) {
      checkStatus();
    }
  }, [user, isInitialCheckDone]);

  const performCheckIn = async (shop: any) => {
    setCheckingIn(true);
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      const activeQ = query(
        collection(db, COLLECTIONS.CHECKINS),
        where('userId', '==', user?.uid),
        where('date', '==', today),
        where('status', '==', 'Active')
      );
      const activeSnap = await getDocs(activeQ);
      const batch = writeBatch(db);
      activeSnap.docs.forEach(docSnap => {
        batch.update(docSnap.ref, { status: 'Inactive' });
      });

      const checkInData = {
        shopId: shop.id,
        shopName: shop.name,
        shopAddress: shop.address || '',
        userId: user?.uid,
        username: user?.email?.split('@')[0] || 'User',
        employeeId: employee?.id || user?.uid,
        employeeName: employee?.name || 'N/A',
        employeeMobile: employee?.mobile || 'N/A',
        locationId: shop.locationId || employee?.locationId || '',
        locationName: shop.locationName || employee?.locationName || '',
        userLatitude: userLocation?.latitude || 0,
        userLongitude: userLocation?.longitude || 0,
        shopLatitude: shop.lat || shop.latitude || 0,
        shopLongitude: shop.lng || shop.longitude || 0,
        distance: shop.distance || 0,
        date: today,
        time: now.toLocaleTimeString(),
        timestamp: serverTimestamp(),
        status: 'Active',
      };

      // 1. Add check-in record
      const checkinRef = doc(collection(db, COLLECTIONS.CHECKINS));
      batch.set(checkinRef, checkInData);
      
      // 2. Update store (shop) with active check-in info
      const storeRef = doc(db, COLLECTIONS.STORES, shop.id);
      batch.update(storeRef, {
        lastCheckInBy: employee?.name || user?.email?.split('@')[0] || 'Agent',
        lastCheckInId: employee?.id || user?.uid,
        lastCheckInTime: serverTimestamp(),
        isActive: true,
      });
      
      // 3. Update employee (user) with current check-in info
      const userRef = doc(db, COLLECTIONS.USERS, employee?.id || user?.uid);
      batch.update(userRef, {
        currentCheckInId: checkinRef.id,
        currentShopId: shop.id,
        currentShopName: shop.name,
        lastCheckInTime: serverTimestamp(),
      });
      
      await batch.commit();
      
      setCurrentCheckIn({ id: checkinRef.id, ...checkInData });
      setIsModalOpen(false);
      Alert.alert('Success', `Checked in at ${shop.name}`);
    } catch (error) {
      console.error('Save check-in error:', error);
      Alert.alert('Error', 'Failed to save check-in details.');
    } finally {
      setCheckingIn(false);
    }
  };

  const renderShopItem = ({ item }: { item: any }) => (
    <View style={styles.shopSlide}>
      <View style={styles.shopCard}>
        <View style={styles.shopIconBox}>
          <Ionicons name="storefront" size={40} color="#4CAF50" />
        </View>
        <Text style={styles.shopNameText}>{item.name}</Text>
        <Text style={styles.shopAddressText}>{item.address}</Text>
        <View style={styles.distanceBadge}>
          <Ionicons name="location-outline" size={14} color="#666" />
          <Text style={styles.distanceText}>{Math.round(item.distance)}m away</Text>
        </View>
        <TouchableOpacity
          style={styles.confirmCheckInButton}
          onPress={() => performCheckIn(item)}
          disabled={checkingIn}
        >
          {checkingIn ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmButtonText}>Check In Now</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const handleSaleOrderPress = async () => {
    if (!currentCheckIn?.shopId) {
      Alert.alert('No Active Check-in', 'Please check-in to a shop first.');
      return;
    }

    setLoadingPrices(true);
    setIsSaleOrderModalOpen(true);
    try {
      // 1. Fetch fresh shop details for credit info
      console.log('Home: Fetching fresh shop details for ID:', currentCheckIn.shopId);
      const shopRef = doc(db, COLLECTIONS.STORES, currentCheckIn.shopId);
      const shopSnap = await getDoc(shopRef);
      
      if (shopSnap.exists()) {
        const data = shopSnap.data();
        setShopDetails({ id: shopSnap.id, ...data });
      }

      // 2. Fetch Items and Shop-specific Prices (Matching Admin Panel logic)
      // Fetch all global items
      console.log('Home: Fetching items from:', COLLECTIONS.ITEMS);
      const itemsSnapshot = await getDocs(collection(db, COLLECTIONS.ITEMS));
      const itemList: any[] = [];
      itemsSnapshot.forEach(doc => {
        const d = doc.data();
        itemList.push({ id: doc.id, ...d });
      });

      // Fetch shop-specific prices
      const pricesSnapshot = await getDocs(collection(db, `${COLLECTIONS.STORES}/${currentCheckIn.shopId}/prices`));
      const pricesMap: any = {};
      pricesSnapshot.forEach(doc => {
        const d = doc.data();
        pricesMap[doc.id] = parseFloat(d.price || 0);
      });

      // 3. Merge: Show ALL items, use shop price if available, fallback to global price
      const finalItems = itemList.map(item => {
        const shopPrice = pricesMap[item.id] || 0;
        const globalPrice = typeof item.price === 'number' ? item.price : parseFloat(item.price || 0);
        
        console.log(`Merging Item: ${item.name}, GlobalPriceRaw: ${item.price}, GlobalPriceParsed: ${globalPrice}, ShopPrice: ${shopPrice}`);
        
        return {
          id: item.id,
          itemName: item.name,
          price: shopPrice > 0 ? shopPrice : globalPrice,
          itemUnit: item.unit || 'pcs',
          category: item.category || 'General'
        };
      });

      setPriceListItems(finalItems);
      setCart({}); // Reset cart
      setOrderItems([]);
      setDiscount('0');
      setReturnAmount('0');
      setReceivedAmount('0');
      setPaymentMethod('Cash');
      setUseCredit(false);
      setOrderStatus('Ordered');
    } catch (error) {
      console.error('Error fetching price list:', error);
      Alert.alert('Error', 'Failed to load items.');
    } finally {
      setLoadingPrices(false);
    }
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) => {
      const newQty = (prev[itemId] || 0) + delta;
      const updatedCart = { ...prev, [itemId]: newQty };
      if (newQty <= 0) {
        delete updatedCart[itemId];
        setOrderItems(orderItems.filter(item => item.itemId !== itemId));
      } else {
        const item = priceListItems.find(i => i.id === itemId);
        if (item) {
          const exists = orderItems.find(oi => oi.itemId === itemId);
          if (exists) {
            setOrderItems(orderItems.map(oi => oi.itemId === itemId ? { ...oi, quantity: newQty } : oi));
          } else {
            setOrderItems([...orderItems, { itemId: item.id, itemName: item.itemName, price: item.price, quantity: newQty, unit: item.itemUnit, batchNumber: '' }]);
          }
        }
      }
      return updatedCart;
    });
  };

  const calculateTotal = () => {
    return orderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  };

  const handleSaveOrder = async () => {
    const total = calculateTotal();
    if (total === 0) {
      Alert.alert('Empty Order', 'Please add at least one item to the order.');
      return;
    }

    setSavingOrder(true);
    try {
      const now = new Date();
      const DD = String(now.getDate()).padStart(2, '0');
      const MM = String(now.getMonth() + 1).padStart(2, '0');
      const YY = String(now.getFullYear()).slice(-2);
      const HH = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const SS = String(now.getSeconds()).padStart(2, '0');
      const customOrderId = `${DD}${MM}${YY}${HH}${mm}${SS}`;

      const subtotalAfterDiscount = total - (parseFloat(discount) || 0);
      const retAmount = parseFloat(returnAmount) || 0;
      const amountToPay = Math.max(0, subtotalAfterDiscount - retAmount);
      
      const availCredit = shopDetails?.credits || shopDetails?.outstandingBalance || shopDetails?.creditBalance || shopDetails?.availableCredit || shopDetails?.creditLimit || 0;
      const creditToApply = useCredit ? Math.min(availCredit, amountToPay) : 0;
      const grandTotal = Math.max(0, amountToPay - creditToApply);
      const received = parseFloat(receivedAmount) || 0;
      const balance = Math.max(0, grandTotal - received);

      const orderData = {
        locationId: shopDetails?.locationId || currentCheckIn.locationId || '',
        locationName: shopDetails?.locationName || currentCheckIn.locationName || '',
        shopId: currentCheckIn.shopId,
        shopName: currentCheckIn.shopName,
        orderId: customOrderId,
        items: orderItems,
        subtotal: total,
        discount: parseFloat(discount) || 0,
        returnAmount: parseFloat(returnAmount) || 0,
        useCredit: useCredit,
        creditUsed: creditToApply,
        grandTotal: grandTotal,
        netPayable: balance + (parseFloat(receivedAmount) || 0), // (GrandTotal - CreditUsed)
        paidAmount: received,
        balance: balance,
        paymentStatus: balance <= 0 ? 'Paid' : (received > 0 ? 'Partial' : 'Unpaid'),
        paymentMethod: paymentMethod,
        employeeId: employee?.id || user?.uid,
        employeeName: employee?.name || 'N/A',
        employeeMobile: employee?.mobile || 'N/A',
        employeeUsername: user?.email?.split('@')[0] || 'N/A',
        type: 'B2B',
        status: orderStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timestamp: serverTimestamp(),
      };

      const batch = writeBatch(db);
      const globalOrderRef = doc(db, 'orders', customOrderId);
      const storeOrderRef = doc(db, `stores/${currentCheckIn.shopId}/sales`, customOrderId);

      batch.set(globalOrderRef, orderData);
      batch.set(storeOrderRef, orderData);
      
      // Update shop's credits if credit was applied
      if (useCredit && creditToApply > 0) {
        console.log(`Home: Deducting ₹${creditToApply} from shop credits...`);
        const shopRef = doc(db, COLLECTIONS.STORES, currentCheckIn.shopId);
        batch.update(shopRef, {
          creditBalance: increment(-creditToApply)
        });

        // Add to Credit History collection (Global and Subcollection)
        const histData = {
          shopId: currentCheckIn.shopId,
          shopName: currentCheckIn.shopName,
          amount: creditToApply,
          type: 'Usage',
          description: `Used for Order #${customOrderId}`,
          createdAt: serverTimestamp(),
          employeeId: employee?.id || user?.uid,
          employeeName: employee?.name || 'N/A',
          employeeMobile: employee?.mobile || 'N/A',
          employeeUsername: user?.email?.split('@')[0] || 'N/A',
          orderId: customOrderId
        };
        const globalHistRef = doc(collection(db, 'creditHistory'));
        const storeHistRef = doc(collection(db, `stores/${currentCheckIn.shopId}/creditHistory`));
        batch.set(globalHistRef, histData);
        batch.set(storeHistRef, histData);
      }

      // Record Payment in payments collection if payment was received
      if (received > 0) {
        console.log(`Home: Recording payment of ₹${received}...`);
        const payData = {
          shopId: currentCheckIn.shopId,
          shopName: currentCheckIn.shopName,
          amount: received,
          method: paymentMethod,
          status: 'Confirmed',
          type: 'Order Payment',
          orderId: customOrderId,
          items: orderItems,
          grandTotal: grandTotal,
          employeeId: employee?.id || user?.uid,
          employeeName: employee?.name || 'N/A',
          employeeMobile: employee?.mobile || 'N/A',
          employeeUsername: user?.email?.split('@')[0] || 'N/A',
          date: now.toISOString().split('T')[0],
          createdAt: serverTimestamp(),
          timestamp: serverTimestamp(),
        };
        const globalPayRef = doc(collection(db, 'payments'));
        const storePayRef = doc(collection(db, `stores/${currentCheckIn.shopId}/payments`));
        batch.set(globalPayRef, payData);
        batch.set(storePayRef, payData);
      }
      
      await batch.commit();
      Alert.alert('Success', `Order #${customOrderId} saved successfully!`);
      setIsSummaryFlyoutOpen(false);
      setIsSaleOrderModalOpen(false);
      setCart({});
      setOrderItems([]);
      setDiscount('0');
      setReturnAmount('0');
      setReceivedAmount('0');
    } catch (error) {
      console.error('Error saving order:', error);
      Alert.alert('Error', 'Failed to save order.');
    } finally {
      setSavingOrder(false);
    }
  };

  const renderOrderItem = ({ item }: { item: any }) => {
    const orderItem = orderItems.find(oi => oi.itemId === item.id);
    const quantity = orderItem?.quantity || 0;
    const batchNumber = orderItem?.batchNumber || '';

    return (
      <View style={styles.orderItemCard}>
        <View style={styles.itemMainRow}>
          <View style={styles.orderItemInfo}>
            <Text style={styles.orderItemName}>{item.itemName}</Text>
            <Text style={styles.orderItemPrice}>₹{item.price} / {item.itemUnit}</Text>
          </View>
          <View style={styles.itemQuantityContainer}>
            <TouchableOpacity 
              onPress={() => updateQuantity(item.id, -1)}
              style={[styles.quantityBtn, { backgroundColor: quantity > 0 ? '#FFEBEE' : '#F5F5F5' }]}
            >
              <Feather name="minus" size={18} color={quantity > 0 ? "#FF5252" : "#BDBDBD"} />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity 
              onPress={() => updateQuantity(item.id, 1)}
              style={[styles.quantityBtn, { backgroundColor: '#E8F5E9' }]}
            >
              <Feather name="plus" size={18} color="#2E7D32" />
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Batch Selection Row - Only show if quantity > 0 */}
        {quantity > 0 && (
          <View style={styles.itemBatchRow}>
            <Ionicons name="layers-outline" size={14} color="#666" style={{ marginRight: 6 }} />
            <Text style={styles.batchLabel}>Batch:</Text>
            <TouchableOpacity 
              style={styles.batchValueBtn}
              onPress={() => {
                setSelectedItemForBatch(item.id);
                setBatchPickerVisible(true);
              }}
            >
              <Text style={styles.batchValueText}>{batchNumber || 'Select Batch'}</Text>
              <Ionicons name="chevron-down" size={12} color="#4CAF50" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Top Header */}
      <View style={styles.topHeader}>
        <Image 
          source={require('../../assets/images/rjr_logo.png')} 
          style={styles.headerLogo}
          resizeMode="contain"
        />
        <TouchableOpacity style={styles.notificationBtn}>
          <Feather name="bell" size={24} color="#333" />
          <View style={styles.notificationBadge}>
            <Text style={styles.badgeText}>3</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.profileTextContainer}>
            <Text style={styles.greetingText}>{getGreeting()}, Agent 👋</Text>
            <Text style={styles.userNameText}>{employee?.name || user?.email?.split('@')[0] || 'Agent'}</Text>
            
            <TouchableOpacity style={styles.locationContainer}>
              <Feather name="map-pin" size={16} color={COLORS.primary} />
              <Text style={styles.locationText} numberOfLines={1}>
                {currentCheckIn ? currentCheckIn.shopAddress : (employee?.locationName || 'Hyderabad, Telangana')}
              </Text>
              <Feather name="chevron-down" size={16} color="#666" />
            </TouchableOpacity>
          </View>
          
          <Image 
            source={require('../../assets/images/home_illustration.png')} 
            style={styles.profileIllustration}
            resizeMode="contain"
          />
        </View>

        {/* Check-In Card */}
        <TouchableOpacity
          style={[styles.checkInCard, currentCheckIn && styles.checkInCardChecked]}
          onPress={handleCheckInPress}
          disabled={checkingIn}
          activeOpacity={0.9}
        >
          <View style={styles.checkInContent}>
            <View style={styles.checkInIconContainer}>
              <View style={[styles.checkInIconBg, currentCheckIn && styles.checkInIconBgChecked]}>
                <Feather 
                  name={currentCheckIn ? "check-circle" : "map-pin"} 
                  size={24} 
                  color={COLORS.primary} 
                />
              </View>
            </View>
            <View style={styles.checkInTextContainer}>
              <Text style={[styles.checkInTitle, currentCheckIn && styles.checkInTitleChecked]}>
                {currentCheckIn ? 'Checked In' : 'Check In'}
              </Text>
              <Text style={[styles.checkInDesc, currentCheckIn && styles.checkInDescChecked]}>
                {currentCheckIn 
                  ? `You are currently at ${currentCheckIn.shopName}`
                  : 'Start your day by checking in at the nearest store to receive orders.'}
              </Text>
            </View>
          </View>
          
          <View style={[styles.checkInButton, currentCheckIn && styles.checkInButtonChecked]}>
            <View style={styles.checkInButtonContent}>
              <Feather 
                name={currentCheckIn ? "navigation" : "maximize"} 
                size={18} 
                color={currentCheckIn ? COLORS.primary : COLORS.white} 
              />
              <Text style={[styles.checkInButtonText, currentCheckIn && styles.checkInButtonTextChecked]}>
                {currentCheckIn ? 'Active' : 'Start'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Menu Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Menu</Text>
        </View>

        <View style={styles.menuGrid}>
          {/* Sale Order */}
          <TouchableOpacity 
            style={styles.menuCard}
            onPress={handleSaleOrderPress}
            disabled={!currentCheckIn}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#E8F5E9' }]}>
              <Feather name="clipboard" size={22} color="#2E7D32" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuCardTitle}>Sale Order</Text>
              <Text style={styles.menuCardSubtitle}>Create new sale order</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#CCC" />
          </TouchableOpacity>

          {/* My Sale Orders */}
          <TouchableOpacity 
            style={styles.menuCard}
            onPress={() => router.push('/orders')}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#E3F2FD' }]}>
              <Feather name="list" size={22} color="#1976D2" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuCardTitle}>My Sale Orders</Text>
              <Text style={styles.menuCardSubtitle}>View and manage orders</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#CCC" />
          </TouchableOpacity>

          {/* Return Orders */}
          <TouchableOpacity 
            style={styles.menuCard}
            onPress={() => router.push('/return_orders')}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#FFF3E0' }]}>
              <Feather name="rotate-ccw" size={22} color="#F57C00" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuCardTitle}>Return Orders</Text>
              <Text style={styles.menuCardSubtitle}>View return orders</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#CCC" />
          </TouchableOpacity>

          {/* Customer Orders */}
          <TouchableOpacity 
            style={styles.menuCard}
            onPress={() => router.push('/customer_orders')}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#F3E5F5' }]}>
              <Feather name="users" size={22} color="#7B1FA2" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuCardTitle}>Customer Orders</Text>
              <Text style={styles.menuCardSubtitle}>View customer orders</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#CCC" />
          </TouchableOpacity>

          {/* Payments */}
          <TouchableOpacity 
            style={styles.menuCard}
            onPress={() => router.push('/payments')}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#E1F5FE' }]}>
              <Feather name="credit-card" size={22} color="#0288D1" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuCardTitle}>Payments</Text>
              <Text style={styles.menuCardSubtitle}>Collect payments</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#CCC" />
          </TouchableOpacity>

          {/* Metrics */}
          <TouchableOpacity 
            style={styles.menuCard}
            onPress={() => router.push('/metrics')}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#FCE4EC' }]}>
              <Feather name="bar-chart-2" size={22} color="#C2185B" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuCardTitle}>Metrics</Text>
              <Text style={styles.menuCardSubtitle}>Track performance</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#CCC" />
          </TouchableOpacity>
        </View>

        {/* Today's Overview */}
        <View style={styles.overviewHeader}>
          <Text style={styles.sectionTitle}>Today's Overview</Text>
          <TouchableOpacity onPress={() => router.push('/metrics')}>
            <View style={styles.viewDetailsBtn}>
              <Text style={styles.viewDetailsText}>View Details</Text>
              <Feather name="chevron-right" size={14} color="#2E7D32" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.overviewContainer}>
          {/* Total Sales */}
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#E8F5E9' }]}>
              <Feather name="shopping-bag" size={16} color="#2E7D32" />
            </View>
            <Text style={styles.statValue}>₹ {overviewStats.totalSales.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Total Sales</Text>
          </View>

          {/* Orders */}
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#E3F2FD' }]}>
              <Feather name="file-text" size={16} color="#1976D2" />
            </View>
            <Text style={styles.statValue}>{overviewStats.orderCount}</Text>
            <Text style={styles.statLabel}>Orders</Text>
          </View>

          {/* Payments */}
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#FFF3E0' }]}>
              <Feather name="credit-card" size={16} color="#F57C00" />
            </View>
            <Text style={styles.statValue}>₹ {overviewStats.payments.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Payments</Text>
          </View>

          {/* Returns */}
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#F3E5F5' }]}>
              <Feather name="rotate-ccw" size={16} color="#7B1FA2" />
            </View>
            <Text style={styles.statValue}>{overviewStats.returns}</Text>
            <Text style={styles.statLabel}>Returns</Text>
          </View>
        </View>

        {/* Bottom Spacer */}
        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Shop Selection Modal */}
      <Modal
        visible={isModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nearest Shops</Text>
              <TouchableOpacity onPress={() => setIsModalOpen(false)}>
                <Feather name="x" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.sliderContainer}>
              <FlatList
                data={nearestShops}
                renderItem={renderShopItem}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                onScroll={(e) => {
                  const offset = e.nativeEvent.contentOffset.x;
                  const index = Math.round(offset / width);
                  setActiveSlideIndex(index);
                }}
              />
            </View>

            {/* Pagination Dots */}
            <View style={styles.paginationDots}>
              {nearestShops.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dotItem,
                    activeSlideIndex === i ? styles.activeDotItem : styles.inactiveDotItem,
                  ]}
                />
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Sale Order Modal */}
      <Modal
        visible={isSaleOrderModalOpen}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setIsSaleOrderModalOpen(false)}
      >
        <SafeAreaView style={styles.saleOrderContainer}>
          <View style={styles.saleOrderHeader}>
            <TouchableOpacity onPress={() => setIsSaleOrderModalOpen(false)}>
              <Feather name="x" size={28} color="#333" />
            </TouchableOpacity>
            <View style={styles.saleOrderHeaderTitle}>
              <Text style={styles.saleOrderShopName}>{currentCheckIn?.shopName}</Text>
              <Text style={styles.saleOrderSubtitle}>New Sale Order</Text>
            </View>
            <View style={{ width: 28 }} />
          </View>

          {loadingPrices ? (
            <View style={styles.centerLoader}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loaderText}>Loading price list...</Text>
            </View>
          ) : (
            <FlatList
              data={priceListItems}
              renderItem={renderOrderItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.orderListContent}
              ListEmptyComponent={
                <View style={styles.emptyItems}>
                  <Feather name="info" size={60} color="#CCC" />
                  <Text style={styles.emptyItemsText}>No items found in price list.</Text>
                </View>
              }
            />
          )}

          {/* Bottom Summary Bar */}
          <View style={styles.summaryBar}>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>Subtotal ({orderItems.length} items)</Text>
              <Text style={styles.summaryValue}>₹{calculateTotal()}</Text>
            </View>
            <TouchableOpacity
              style={[styles.saveOrderBtn, calculateTotal() === 0 && styles.disabledSaveBtn]}
              onPress={() => setIsSummaryFlyoutOpen(true)}
              disabled={calculateTotal() === 0}
            >
              <Text style={styles.saveOrderBtnText}>Review Order</Text>
              <Feather name="chevron-up" size={20} color="#fff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Summary Flyout */}
        {isSummaryFlyoutOpen && (
          <View style={styles.flyoutOverlay}>
            <TouchableOpacity 
              style={styles.flyoutDismiss} 
              onPress={() => setIsSummaryFlyoutOpen(false)} 
              activeOpacity={1}
            />
            <View style={styles.flyoutContent}>
              <View style={styles.flyoutHeader}>
                <View style={styles.flyoutHeaderMain}>
                  <View style={styles.flyoutHandle} />
                  <Text style={styles.flyoutTitle}>Order Summary</Text>
                </View>
                <TouchableOpacity 
                  style={styles.flyoutCloseBtn} 
                  onPress={() => setIsSummaryFlyoutOpen(false)}
                >
                  <Feather name="x" size={24} color="#333" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.flyoutBody} showsVerticalScrollIndicator={false}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabelText}>Total Items</Text>
                  <Text style={styles.summaryValueText}>{Object.values(cart).reduce((a, b) => a + b, 0)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabelText}>Total</Text>
                  <Text style={styles.summaryValueText}>₹{calculateTotal()}</Text>
                </View>

                <View style={styles.inputSection}>
                  <Text style={styles.summaryLabelText}>Discount (₹)</Text>
                  <TextInput
                    style={styles.summaryInput}
                    keyboardType="numeric"
                    value={discount}
                    onChangeText={setDiscount}
                    placeholder="0"
                  />
                </View>

                <View style={styles.inputSection}>
                  <Text style={styles.summaryLabelText}>Return Amount (₹)</Text>
                  <TextInput
                    style={styles.summaryInput}
                    keyboardType="numeric"
                    value={returnAmount}
                    onChangeText={setReturnAmount}
                    placeholder="0"
                  />
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.grandTotalLabelText}>Final Amount</Text>
                  <Text style={styles.grandTotalValueText}>
                    ₹{Math.max(0, (calculateTotal() - (parseFloat(discount) || 0) - (parseFloat(returnAmount) || 0)) - (useCredit ? Math.min(shopDetails?.credits || shopDetails?.outstandingBalance || shopDetails?.creditBalance || shopDetails?.availableCredit || shopDetails?.creditLimit || 0, calculateTotal() - (parseFloat(discount) || 0) - (parseFloat(returnAmount) || 0)) : 0))}
                  </Text>
                </View>

                <View style={styles.flyoutDivider} />

                <View style={styles.creditToggleSection}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.creditLabel}>Apply Shop Credit</Text>
                    <Text style={styles.creditValue}>
                      {shopDetails ? (
                        (shopDetails.credits || shopDetails.outstandingBalance || shopDetails.creditBalance || shopDetails.availableCredit || shopDetails.creditLimit) 
                          ? `Available: ₹${shopDetails.credits || shopDetails.outstandingBalance || shopDetails.creditBalance || shopDetails.availableCredit || shopDetails.creditLimit}`
                          : 'No credit limit set'
                      ) : 'Fetching credit info...'}
                    </Text>
                  </View>
                  <Switch
                    trackColor={{ false: '#DDD', true: '#C8E6C9' }}
                    thumbColor={useCredit ? COLORS.primary : '#F4F3F4'}
                    onValueChange={() => {
                      const avail = shopDetails?.credits || shopDetails?.outstandingBalance || shopDetails?.creditBalance || shopDetails?.availableCredit || shopDetails?.creditLimit || 0;
                      if (avail > 0) {
                        setUseCredit(!useCredit);
                      } else {
                        Alert.alert('No Credit', 'This shop does not have any available credit limit to use.');
                      }
                    }}
                    value={useCredit}
                    disabled={!shopDetails || !(shopDetails.credits || shopDetails.outstandingBalance || shopDetails.creditBalance || shopDetails.availableCredit || shopDetails.creditLimit > 0)}
                  />
                </View>

                <View style={styles.inputSection}>
                  <Text style={styles.summaryLabelText}>Received Amount (₹)</Text>
                  <TextInput
                    style={[styles.summaryInput, { color: COLORS.primary }]}
                    keyboardType="numeric"
                    value={receivedAmount}
                    onChangeText={(val) => setReceivedAmount(val)}
                    placeholder="0"
                  />
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.balanceLabelText}>Balance Due</Text>
                  <Text style={[styles.balanceValueText, (Math.max(0, (calculateTotal() - (parseFloat(discount) || 0) - (parseFloat(returnAmount) || 0)) - (useCredit ? Math.min(shopDetails?.credits || shopDetails?.outstandingBalance || shopDetails?.creditBalance || shopDetails?.availableCredit || shopDetails?.creditLimit || 0, calculateTotal() - (parseFloat(discount) || 0) - (parseFloat(returnAmount) || 0)) : 0)) - (parseFloat(receivedAmount) || 0)) > 0 ? { color: '#FF5252' } : { color: COLORS.primary }]}>
                    ₹{Math.max(0, (Math.max(0, (calculateTotal() - (parseFloat(discount) || 0) - (parseFloat(returnAmount) || 0)) - (useCredit ? Math.min(shopDetails?.credits || shopDetails?.outstandingBalance || shopDetails?.creditBalance || shopDetails?.availableCredit || shopDetails?.creditLimit || 0, calculateTotal() - (parseFloat(discount) || 0) - (parseFloat(returnAmount) || 0)) : 0))) - (parseFloat(receivedAmount) || 0))}
                  </Text>
                </View>

                <View style={styles.paymentMethodSection}>
                  <Text style={styles.sectionSmallTitle}>Order Status</Text>
                  <View style={styles.methodGrid}>
                    {['Ordered', 'Shipped', 'Delivered', 'Completed', 'Cancelled'].map((status) => (
                      <TouchableOpacity
                        key={status}
                        style={[styles.methodBtn, orderStatus === status && styles.activeMethodBtn]}
                        onPress={() => setOrderStatus(status)}
                      >
                        <Text style={[styles.methodBtnText, orderStatus === status && styles.activeMethodBtnText]}>{status}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.paymentMethodSection}>
                  <Text style={styles.sectionSmallTitle}>Payment Method</Text>
                  <View style={styles.methodGrid}>
                    {['Cash', 'UPI', 'Card'].map((method) => (
                      <TouchableOpacity
                        key={method}
                        style={[styles.methodBtn, paymentMethod === method && styles.activeMethodBtn]}
                        onPress={() => setPaymentMethod(method)}
                      >
                        <Text style={[styles.methodBtnText, paymentMethod === method && styles.activeMethodBtnText]}>{method}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.flyoutFooterActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setIsSummaryFlyoutOpen(false)}
                    disabled={savingOrder}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.confirmSaveBtn, savingOrder && styles.disabledSaveBtn]}
                    onPress={handleSaveOrder}
                    disabled={savingOrder}
                  >
                    {savingOrder ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.confirmSaveBtnText}>Confirm & Save</Text>
                        <Feather name="check-circle" size={18} color="#fff" style={{ marginLeft: 6 }} />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>

      {/* Batch Picker Modal */}
      <Modal
        visible={batchPickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setBatchPickerVisible(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContent}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Batch</Text>
              <TouchableOpacity onPress={() => setBatchPickerVisible(false)}>
                <Feather name="x" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={batches}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.batchItem}
                  onPress={() => {
                    setOrderItems(prev => prev.map(oi => 
                      oi.itemId === selectedItemForBatch ? { ...oi, batchNumber: item.batchNumber } : oi
                    ));
                    setBatchPickerVisible(false);
                  }}
                >
                  <Feather name="layers" size={18} color={COLORS.primary} />
                  <Text style={styles.batchItemText}>{item.batchNumber}</Text>
                  {orderItems.find(oi => oi.itemId === selectedItemForBatch)?.batchNumber === item.batchNumber && (
                    <Feather name="check-circle" size={20} color={COLORS.primary} style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Text style={{ color: '#999' }}>No batches available.</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}


const COLORS = {
  primary: '#1B3C1A',
  accent: '#DC2626',
  background: '#F8F9FA',
  white: '#FFFFFF',
  text: '#1F2937',
  subtext: '#6B7280',
  border: '#E5E7EB',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 15,
  },
  headerLogo: {
    width: 120,
    height: 40,
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: COLORS.accent,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  profileSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  profileTextContainer: {
    flex: 1,
  },
  greetingText: {
    fontSize: 16,
    color: COLORS.subtext,
    fontWeight: '500',
  },
  userNameText: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    marginVertical: 4,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  locationText: {
    fontSize: 14,
    color: COLORS.subtext,
    marginHorizontal: 6,
    maxWidth: '70%',
  },
  profileIllustration: {
    width: 140,
    height: 140,
  },
  checkInCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 24,
    marginBottom: 30,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 0,
    shadowColor: 'transparent',
  },
  checkInCardChecked: {
    backgroundColor: COLORS.primary,
    borderStyle: 'solid',
    elevation: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  checkInContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkInIconContainer: {
    marginRight: 15,
  },
  checkInIconBg: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkInIconBgChecked: {
    backgroundColor: COLORS.white,
  },
  checkInTextContainer: {
    flex: 1,
    paddingRight: 10,
  },
  checkInTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },
  checkInTitleChecked: {
    color: COLORS.white,
  },
  checkInDesc: {
    color: COLORS.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  checkInDescChecked: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  checkInButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  checkInButtonChecked: {
    backgroundColor: COLORS.white,
  },
  checkInButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkInButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  checkInButtonTextChecked: {
    color: COLORS.primary,
  },
  sectionHeader: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 15,
    marginBottom: 30,
  },
  menuCard: {
    width: (width - 55) / 2,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  menuIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  menuCardSubtitle: {
    fontSize: 10,
    color: COLORS.subtext,
    marginTop: 2,
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  viewDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewDetailsText: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '600',
  },
  overviewContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  statCard: {
    alignItems: 'center',
    flex: 1,
  },
  statIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.subtext,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 25,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  sliderContainer: {
    height: 320,
  },
  shopSlide: {
    width: width,
    padding: 25,
    alignItems: 'center',
  },
  shopCard: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  shopIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  shopNameText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  shopAddressText: {
    fontSize: 14,
    color: COLORS.subtext,
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 20,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginBottom: 20,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.subtext,
    marginLeft: 4,
  },
  confirmCheckInButton: {
    backgroundColor: COLORS.primary,
    width: '100%',
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  dotItem: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  activeDotItem: {
    backgroundColor: COLORS.primary,
    width: 20,
  },
  inactiveDotItem: {
    backgroundColor: '#DDD',
  },
  saleOrderContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  saleOrderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  saleOrderHeaderTitle: {
    alignItems: 'center',
  },
  saleOrderShopName: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  saleOrderSubtitle: {
    fontSize: 12,
    color: COLORS.subtext,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  centerLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontSize: 14,
  },
  orderListContent: {
    padding: 20,
    paddingBottom: 100,
  },
  orderItemCard: {
    backgroundColor: COLORS.white,
    padding: 15,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  itemMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderItemInfo: {
    flex: 1,
  },
  orderItemName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  orderItemPrice: {
    fontSize: 14,
    color: COLORS.subtext,
  },
  itemQuantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quantityBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  quantityText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    marginHorizontal: 12,
    minWidth: 20,
    textAlign: 'center',
  },
  itemBatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  batchLabel: {
    fontSize: 12,
    color: COLORS.subtext,
    marginRight: 6,
  },
  batchValueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  batchValueText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  emptyItems: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyItemsText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontSize: 16,
  },
  summaryBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    color: COLORS.subtext,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.text,
  },
  saveOrderBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 25,
    paddingVertical: 15,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  disabledSaveBtn: {
    backgroundColor: '#CCC',
  },
  saveOrderBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  flyoutOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  flyoutDismiss: {
    flex: 1,
  },
  flyoutContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingBottom: 40,
    elevation: 25,
  },
  flyoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  flyoutHeaderMain: {
    alignItems: 'center',
    flex: 1,
    marginLeft: 40,
  },
  flyoutHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#E5E7EB',
    borderRadius: 2.5,
    marginBottom: 10,
  },
  flyoutTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  flyoutCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flyoutBody: {
    paddingHorizontal: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabelText: {
    fontSize: 14,
    color: COLORS.subtext,
  },
  summaryValueText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  inputSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 12,
  },
  summaryInput: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'right',
    flex: 1,
  },
  grandTotalLabelText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  grandTotalValueText: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.primary,
  },
  flyoutDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 15,
  },
  creditToggleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  creditLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  creditValue: {
    fontSize: 12,
    color: COLORS.subtext,
    marginTop: 2,
  },
  balanceLabelText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  balanceValueText: {
    fontSize: 18,
    fontWeight: '800',
  },
  paymentMethodSection: {
    marginTop: 20,
  },
  sectionSmallTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  methodBtn: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  activeMethodBtn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  methodBtnText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  activeMethodBtnText: {
    color: COLORS.white,
  },
  flyoutFooterActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelBtnText: {
    color: COLORS.subtext,
    fontSize: 16,
    fontWeight: '700',
  },
  confirmSaveBtn: {
    flex: 2,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  confirmSaveBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  pickerContent: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    maxHeight: '60%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  batchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  batchItemText: {
    fontSize: 16,
    color: COLORS.text,
    marginLeft: 12,
    fontWeight: '500',
  },
});

