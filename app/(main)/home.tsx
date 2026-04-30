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
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { db } from '../../config/firebase';
import { collection, getDocs, addDoc, serverTimestamp, query, where, orderBy, setDoc, doc, getDoc, updateDoc, increment } from 'firebase/firestore';
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
  const [receivedAmount, setReceivedAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [useCredit, setUseCredit] = useState(false);
  const [shopDetails, setShopDetails] = useState<any>(null);
  const [isSummaryFlyoutOpen, setIsSummaryFlyoutOpen] = useState(false);

  // Fetch employee details on mount
  useEffect(() => {
    const fetchEmployee = async () => {
      if (!user?.email) return;
      try {
        const username = user.email.split('@')[0].toLowerCase();
        console.log(`Home: Fetching employee details for username: ${username}`);
        
        const q = query(collection(db, 'employees'), where('username', '==', username));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          setEmployee({ ...docSnap.data(), id: docSnap.id });
        } else {
          console.warn('Home: No employee document found for username:', username);
          // Fallback to UID
          const qUid = query(collection(db, 'employees'), where('uid', '==', user.uid));
          const snapUid = await getDocs(qUid);
          if (!snapUid.empty) {
            const docSnapUid = snapUid.docs[0];
            setEmployee({ ...docSnapUid.data(), id: docSnapUid.id });
          }
        }
      } catch (err) {
        console.error('Home: Error fetching employee details:', err);
      }
    };
    fetchEmployee();
  }, [user]);

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
      const shopsSnap = await getDocs(collection(db, 'shops'));
      const allShops: any[] = [];
      
      console.log(`Total shops found in DB: ${shopsSnap.size}`);

      shopsSnap.forEach((doc) => {
        const data = doc.data();
        if (data.latitude && data.longitude) {
          const shopLat = parseFloat(data.latitude);
          const shopLon = parseFloat(data.longitude);
          
          if (!isNaN(shopLat) && !isNaN(shopLon)) {
            const dist = getDistance(latitude, longitude, shopLat, shopLon);
            console.log(`Shop: ${data.name}, Lat: ${shopLat}, Lon: ${shopLon}, Distance: ${dist.toFixed(2)}m`);
            
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
        const today = new Date().toISOString().split('T')[0];
        const q = query(
          collection(db, 'checkins'),
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
      let finalEmployee = employee;

      // Double check: if employee is still null, try fetching one last time
      if (!finalEmployee && user?.email) {
        const username = user.email.split('@')[0].toLowerCase();
        const q = query(collection(db, 'employees'), where('username', '==', username));
        const snap = await getDocs(q);
        if (!snap.empty) {
          finalEmployee = snap.docs[0].data();
          setEmployee(finalEmployee);
        }
      }

      const checkInData = {
        shopId: shop.id,
        shopName: shop.name,
        shopAddress: shop.address || '',
        userId: user?.uid,
        username: user?.email?.split('@')[0] || 'User',
        employeeId: finalEmployee?.id || user?.uid,
        employeeName: finalEmployee?.name || 'N/A',
        employeeMobile: finalEmployee?.mobile || 'N/A',
        priceListId: shop.priceListId || '',
        userLatitude: userLocation?.latitude || 0,
        userLongitude: userLocation?.longitude || 0,
        shopLatitude: shop.latitude || 0,
        shopLongitude: shop.longitude || 0,
        distance: shop.distance || 0,
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString(),
        timestamp: serverTimestamp(),
        status: 'Active',
      };

      await addDoc(collection(db, 'checkins'), checkInData);
      setCurrentCheckIn(checkInData);
      setIsModalOpen(false);
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
    if (!currentCheckIn?.priceListId) {
      Alert.alert('No Price List', 'This shop does not have an assigned price list.');
      return;
    }

    setLoadingPrices(true);
    setIsSaleOrderModalOpen(true);
    try {
      // Fetch Shop Details directly by ID for credit/balance info
      console.log('Home: Fetching fresh shop details for ID:', currentCheckIn.shopId);
      const shopRef = doc(db, 'shops', currentCheckIn.shopId);
      const shopSnap = await getDoc(shopRef);
      
      if (shopSnap.exists()) {
        const data = shopSnap.data();
        console.log('Home: Shop data fetched:', data);
        setShopDetails({ id: shopSnap.id, ...data });
      } else {
        console.warn('Home: Shop document not found for ID:', currentCheckIn.shopId);
      }

      const q = query(
        collection(db, `priceLists/${currentCheckIn.priceListId}/items`),
        orderBy('itemName', 'asc')
      );
      const snap = await getDocs(q);
      const items: any[] = [];
      snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
      setPriceListItems(items);
      setCart({}); // Reset cart
      setDiscount('0');
      setReceivedAmount('0');
      setPaymentMethod('Cash');
      setUseCredit(false);
    } catch (error) {
      console.error('Error fetching price list:', error);
      Alert.alert('Error', 'Failed to load items.');
    } finally {
      setLoadingPrices(false);
    }
  };

  const updateCart = (itemId: string, delta: number) => {
    setCart((prev) => {
      const newQty = (prev[itemId] || 0) + delta;
      if (newQty <= 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: newQty };
    });
  };

  const calculateTotal = () => {
    return priceListItems.reduce((acc, item) => {
      const qty = cart[item.id] || 0;
      return acc + item.price * qty;
    }, 0);
  };

  const handleSaveOrder = async () => {
    const total = calculateTotal();
    if (total === 0) {
      Alert.alert('Empty Order', 'Please add at least one item to the order.');
      return;
    }

    setSavingOrder(true);
    try {
      const orderItems = priceListItems
        .filter((item) => cart[item.id] > 0)
        .map((item) => ({
          itemId: item.itemId,
          itemName: item.itemName,
          price: item.price,
          quantity: cart[item.id],
          unit: item.itemUnit,
          subtotal: item.price * cart[item.id],
        }));

      const now = new Date();
      const DD = String(now.getDate()).padStart(2, '0');
      const MM = String(now.getMonth() + 1).padStart(2, '0');
      const YY = String(now.getFullYear()).slice(-2);
      const HH = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const SS = String(now.getSeconds()).padStart(2, '0');
      const customOrderId = `${DD}${MM}${YY}${HH}${mm}${SS}`;

      const subtotalAfterDiscount = total - (parseFloat(discount) || 0);
      const availCredit = shopDetails?.credits || shopDetails?.outstandingBalance || shopDetails?.creditBalance || shopDetails?.availableCredit || shopDetails?.creditLimit || 0;
      const creditToApply = useCredit ? Math.min(availCredit, subtotalAfterDiscount) : 0;
      const grandTotal = Math.max(0, subtotalAfterDiscount - creditToApply);
      const received = parseFloat(receivedAmount) || 0;
      const balance = Math.max(0, grandTotal - received);

      const orderData = {
        orderId: customOrderId,
        shopId: currentCheckIn.shopId,
        shopName: currentCheckIn.shopName,
        employeeId: employee?.id || user?.uid,
        employeeName: employee?.name || 'N/A',
        employeeMobile: employee?.mobile || 'N/A',
        items: orderItems,
        totalSubtotal: total,
        discount: parseFloat(discount) || 0,
        grandTotal: grandTotal,
        appliedCredit: creditToApply,
        paymentReceived: received,
        balance: balance,
        paymentMethod: paymentMethod,
        useCredit: useCredit,
        status: 'Pending',
        createdAt: now.toISOString(),
        timestamp: serverTimestamp(),
      };

      await setDoc(doc(db, 'orders', customOrderId), orderData);
      
      // Update shop's credits if credit was applied
      if (useCredit && creditToApply > 0) {
        console.log(`Home: Deducting ₹${creditToApply} from shop credits...`);
        const shopRef = doc(db, 'shops', currentCheckIn.shopId);
        await updateDoc(shopRef, {
          credits: increment(-creditToApply)
        });

        // Add to Credit History collection
        console.log(`Home: Recording credit history entry...`);
        await addDoc(collection(db, 'creditHistory'), {
          shopId: currentCheckIn.shopId,
          shopName: currentCheckIn.shopName,
          amount: -creditToApply,
          type: 'Debit',
          description: `Used for Order #${customOrderId}`,
          orderId: customOrderId,
          employeeId: employee?.id || user?.uid,
          employeeName: employee?.name || 'N/A',
          date: now.toISOString().split('T')[0],
          timestamp: serverTimestamp(),
        });
      }
      
      Alert.alert('Success', `Order #${customOrderId} saved successfully!`);
      setIsSummaryFlyoutOpen(false);
      setIsSaleOrderModalOpen(false);
      setCart({});
      setDiscount('0');
      setReceivedAmount('0');
    } catch (error) {
      console.error('Error saving order:', error);
      Alert.alert('Error', 'Failed to save order.');
    } finally {
      setSavingOrder(false);
    }
  };

  const renderOrderItem = ({ item }: { item: any }) => {
    const qty = cart[item.id] || 0;
    return (
      <View style={styles.orderItemCard}>
        <View style={styles.orderItemInfo}>
          <Text style={styles.orderItemName}>{item.itemName}</Text>
          <Text style={styles.orderItemPrice}>₹{item.price} / {item.itemUnit}</Text>
        </View>
        <View style={styles.qtyControls}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => updateCart(item.id, -1)}
            disabled={qty === 0}
          >
            <Ionicons name="remove" size={20} color={qty === 0 ? '#CCC' : '#4CAF50'} />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{qty}</Text>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => updateCart(item.id, 1)}
          >
            <Ionicons name="add" size={20} color="#4CAF50" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.email?.split('@')[0] || 'User'}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={styles.profileButton} 
            onPress={() => router.push('/profile')}
          >
            <Ionicons name="person-circle-outline" size={28} color="#4CAF50" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={loggingOut}>
            {loggingOut ? (
              <ActivityIndicator size="small" color="#FF5252" />
            ) : (
              <Ionicons name="log-out-outline" size={24} color="#FF5252" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Check-In Card */}
        <TouchableOpacity
          style={[styles.bigCard, currentCheckIn && styles.activeCheckInCard]}
          onPress={handleCheckInPress}
          disabled={checkingIn}
        >
          <LinearGradient
            colors={currentCheckIn ? ['#4CAF50', '#2E7D32'] : ['#fff', '#f9f9f9']}
            style={styles.bigCardGradient}
          >
            <View style={styles.bigCardContent}>
              <View style={[styles.bigIconBox, currentCheckIn && { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                {checkingIn ? (
                  <ActivityIndicator color={currentCheckIn ? '#fff' : '#4CAF50'} />
                ) : (
                  <Ionicons
                    name={currentCheckIn ? 'checkmark-circle' : 'location'}
                    size={32}
                    color={currentCheckIn ? '#fff' : '#4CAF50'}
                  />
                )}
              </View>
              <View style={styles.bigCardText}>
                <Text style={[styles.bigCardTitle, currentCheckIn && { color: '#fff' }]}>
                  {currentCheckIn ? 'Checked In' : 'Check In'}
                </Text>
                <Text style={[styles.bigCardDesc, currentCheckIn && { color: 'rgba(255,255,255,0.8)' }]}>
                  {currentCheckIn
                    ? `Active at ${currentCheckIn.shopName}`
                    : 'Locate and check-in to a nearby shop'}
                </Text>
              </View>
              {!currentCheckIn && (
                <Ionicons name="chevron-forward" size={24} color="#CCC" />
              )}
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.actionsGrid}>
          {/* Sale Order Card */}
          <TouchableOpacity
            style={[styles.actionCard, !currentCheckIn && styles.disabledCard]}
            disabled={!currentCheckIn}
            onPress={handleSaleOrderPress}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="cart" size={28} color={currentCheckIn ? '#2196F3' : '#999'} />
            </View>
            <Text style={[styles.actionTitle, !currentCheckIn && { color: '#999' }]}>Sale Order</Text>
            {!currentCheckIn && <Ionicons name="lock-closed" size={14} color="#CCC" style={styles.lockIcon} />}
          </TouchableOpacity>

          {/* My Orders Card */}
          <TouchableOpacity
            style={[styles.actionCard, !currentCheckIn && styles.disabledCard]}
            disabled={!currentCheckIn}
            activeOpacity={0.7}
            onPress={() => router.push('/orders')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F3E5F5' }]}>
              <Ionicons name="receipt" size={28} color={currentCheckIn ? '#9C27B0' : '#999'} />
            </View>
            <Text style={[styles.actionTitle, !currentCheckIn && { color: '#999' }]}>My Sale Orders</Text>
            {!currentCheckIn && <Ionicons name="lock-closed" size={14} color="#CCC" style={styles.lockIcon} />}
          </TouchableOpacity>
        </View>

        <View style={[styles.actionsGrid, { marginTop: 15 }]}>
          {/* Payments Card */}
          <TouchableOpacity
            style={[styles.actionCard, !currentCheckIn && styles.disabledCard]}
            disabled={!currentCheckIn}
            activeOpacity={0.7}
            onPress={() => router.push('/payments')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E1F5FE' }]}>
              <Ionicons name="wallet" size={28} color={currentCheckIn ? '#03A9F4' : '#999'} />
            </View>
            <Text style={[styles.actionTitle, !currentCheckIn && { color: '#999' }]}>Payments</Text>
            {!currentCheckIn && <Ionicons name="lock-closed" size={14} color="#CCC" style={styles.lockIcon} />}
          </TouchableOpacity>

          {/* Return Orders Card */}
          <TouchableOpacity
            style={[styles.actionCard, !currentCheckIn && styles.disabledCard]}
            disabled={!currentCheckIn}
            activeOpacity={0.7}
            onPress={() => router.push('/return_orders')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="refresh-circle" size={28} color={currentCheckIn ? '#FF9800' : '#999'} />
            </View>
            <Text style={[styles.actionTitle, !currentCheckIn && { color: '#999' }]}>Return Orders</Text>
            {!currentCheckIn && <Ionicons name="lock-closed" size={14} color="#CCC" style={styles.lockIcon} />}
          </TouchableOpacity>
        </View>

        <View style={[styles.actionsGrid, { marginTop: 15 }]}>
          {/* Customer Orders Card */}
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.7}
            onPress={() => router.push('/customer_orders')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="people" size={28} color="#4CAF50" />
            </View>
            <Text style={styles.actionTitle}>Customer Orders</Text>
          </TouchableOpacity>

          {/* Metrics Card */}
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.7}
            onPress={() => router.push('/metrics')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#FCE4EC' }]}>
              <Ionicons name="bar-chart" size={28} color="#E91E63" />
            </View>
            <Text style={styles.actionTitle}>Metrics</Text>
          </TouchableOpacity>
        </View>
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
                <Ionicons name="close" size={24} color="#333" />
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
            <View style={styles.pagination}>
              {nearestShops.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    activeSlideIndex === i ? styles.activeDot : styles.inactiveDot,
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
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
            <View style={styles.saleOrderHeaderTitle}>
              <Text style={styles.saleOrderShopName}>{currentCheckIn?.shopName}</Text>
              <Text style={styles.saleOrderSubtitle}>New Sale Order</Text>
            </View>
            <View style={{ width: 28 }} />
          </View>

          {loadingPrices ? (
            <View style={styles.centerLoader}>
              <ActivityIndicator size="large" color="#4CAF50" />
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
                  <Ionicons name="alert-circle-outline" size={60} color="#CCC" />
                  <Text style={styles.emptyItemsText}>No items found in price list.</Text>
                </View>
              }
            />
          )}

          {/* Bottom Summary Bar */}
          <View style={styles.summaryBar}>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>Subtotal ({Object.values(cart).reduce((a, b) => a + b, 0)} items)</Text>
              <Text style={styles.summaryValue}>₹{calculateTotal()}</Text>
            </View>
            <TouchableOpacity
              style={[styles.saveOrderBtn, calculateTotal() === 0 && styles.disabledSaveBtn]}
              onPress={() => setIsSummaryFlyoutOpen(true)}
              disabled={calculateTotal() === 0}
            >
              <Text style={styles.saveOrderBtnText}>Review Order</Text>
              <Ionicons name="chevron-up" size={20} color="#fff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Summary Flyout (Animated View instead of nested Modal) */}
        {isSummaryFlyoutOpen && (
          <View style={styles.flyoutOverlay}>
            <TouchableOpacity 
              style={styles.flyoutDismiss} 
              onPress={() => setIsSummaryFlyoutOpen(false)} 
              activeOpacity={1}
            />
            <View style={styles.flyoutContent}>
              <View style={styles.flyoutHeader}>
                <View style={styles.flyoutHandle} />
                <Text style={styles.flyoutTitle}>Order Summary</Text>
              </View>

              <ScrollView style={styles.flyoutBody} showsVerticalScrollIndicator={false}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabelText}>Total Items</Text>
                  <Text style={styles.summaryValueText}>{Object.values(cart).reduce((a, b) => a + b, 0)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabelText}>Subtotal</Text>
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

                <View style={styles.summaryRow}>
                  <Text style={styles.grandTotalLabelText}>Grand Total</Text>
                  <Text style={styles.grandTotalValueText}>
                    ₹{Math.max(0, calculateTotal() - (parseFloat(discount) || 0) - (useCredit ? Math.min(shopDetails?.credits || shopDetails?.outstandingBalance || shopDetails?.creditBalance || shopDetails?.availableCredit || shopDetails?.creditLimit || 0, calculateTotal() - (parseFloat(discount) || 0)) : 0))}
                  </Text>
                </View>

                <View style={styles.flyoutDivider} />

                {/* Credit Toggle - Always Visible */}
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
                    thumbColor={useCredit ? '#4CAF50' : '#F4F3F4'}
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
                    style={[styles.summaryInput, { color: '#4CAF50' }]}
                    keyboardType="numeric"
                    value={receivedAmount}
                    onChangeText={setReceivedAmount}
                    placeholder="0"
                  />
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.balanceLabelText}>Balance Due</Text>
                  <Text style={[styles.balanceValueText, (calculateTotal() - (parseFloat(discount) || 0) - (useCredit ? Math.min(shopDetails?.credits || shopDetails?.outstandingBalance || shopDetails?.creditBalance || shopDetails?.availableCredit || shopDetails?.creditLimit || 0, calculateTotal() - (parseFloat(discount) || 0)) : 0) - (parseFloat(receivedAmount) || 0)) > 0 ? { color: '#FF5252' } : { color: '#4CAF50' }]}>
                    ₹{Math.max(0, calculateTotal() - (parseFloat(discount) || 0) - (useCredit ? Math.min(shopDetails?.credits || shopDetails?.outstandingBalance || shopDetails?.creditBalance || shopDetails?.availableCredit || shopDetails?.creditLimit || 0, calculateTotal() - (parseFloat(discount) || 0)) : 0) - (parseFloat(receivedAmount) || 0))}
                  </Text>
                </View>

                <View style={styles.paymentMethodSection}>
                  <Text style={styles.sectionSmallTitle}>Payment Method</Text>
                  <View style={styles.methodGrid}>
                    {['Cash', 'Online', 'Card'].map((method) => (
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

                <TouchableOpacity
                  style={[styles.confirmSaveBtn, savingOrder && styles.disabledSaveBtn]}
                  onPress={handleSaveOrder}
                  disabled={savingOrder}
                >
                  {savingOrder ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.confirmSaveBtnText}>Confirm & Save Order</Text>
                      <Ionicons name="checkmark-circle" size={22} color="#fff" style={{ marginLeft: 8 }} />
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  welcomeText: {
    fontSize: 14,
    color: '#666',
  },
  userName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#333',
    textTransform: 'capitalize',
  },
  logoutButton: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#FFF5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileButton: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#F1F8F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  scrollContent: {
    padding: 20,
  },
  bigCard: {
    width: '100%',
    borderRadius: 25,
    marginBottom: 25,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    overflow: 'hidden',
  },
  activeCheckInCard: {
    elevation: 8,
    shadowColor: '#4CAF50',
    shadowOpacity: 0.3,
  },
  bigCardGradient: {
    padding: 25,
  },
  bigCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bigIconBox: {
    width: 65,
    height: 65,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
  },
  bigCardText: {
    flex: 1,
  },
  bigCardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#333',
    marginBottom: 4,
  },
  bigCardDesc: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionCard: {
    width: (width - 60) / 2,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 25,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    position: 'relative',
  },
  disabledCard: {
    backgroundColor: '#F5F5F5',
    elevation: 0,
    shadowOpacity: 0,
  },
  actionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  lockIcon: {
    position: 'absolute',
    top: 15,
    right: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
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
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#333',
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
    backgroundColor: '#F9F9F9',
    borderRadius: 25,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEE',
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
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  shopAddressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 20,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginBottom: 20,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginLeft: 4,
  },
  confirmCheckInButton: {
    backgroundColor: '#4CAF50',
    width: '100%',
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: '#4CAF50',
    width: 20,
  },
  inactiveDot: {
    backgroundColor: '#DDD',
  },
  // Sale Order Styles
  saleOrderContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  saleOrderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  saleOrderHeaderTitle: {
    alignItems: 'center',
  },
  saleOrderShopName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#333',
  },
  saleOrderSubtitle: {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  orderListContent: {
    padding: 20,
    paddingBottom: 100,
  },
  orderItemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    padding: 15,
    borderRadius: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  orderItemInfo: {
    flex: 1,
  },
  orderItemName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  orderItemPrice: {
    fontSize: 14,
    color: '#666',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EEE',
    padding: 4,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#333',
    marginHorizontal: 15,
    minWidth: 20,
    textAlign: 'center',
  },
  centerLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 10,
    color: '#666',
    fontSize: 14,
  },
  emptyItems: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyItemsText: {
    marginTop: 10,
    color: '#999',
    fontSize: 16,
  },
  summaryBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
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
    color: '#666',
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#333',
  },
  saveOrderBtn: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 25,
    paddingVertical: 15,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  disabledSaveBtn: {
    backgroundColor: '#CCC',
  },
  saveOrderBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Order Summary Card Styles
  orderSummaryCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#EEE',
    borderStyle: 'dashed',
  },
  orderSummaryTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#333',
    marginBottom: 15,
  },
  orderSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderSummaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  orderSummaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  orderSummaryDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 10,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#333',
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#4CAF50',
  },
  // Flyout Styles
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
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingBottom: 40,
    elevation: 25,
  },
  flyoutHeader: {
    alignItems: 'center',
    paddingVertical: 15,
  },
  flyoutHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#EEE',
    borderRadius: 2.5,
    marginBottom: 10,
  },
  flyoutTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#333',
  },
  flyoutBody: {
    paddingHorizontal: 20,
  },
  summaryLabelText: {
    fontSize: 13,
    color: '#666',
  },
  summaryValueText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  inputSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  summaryInput: {
    width: 100,
    height: 36,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    paddingHorizontal: 12,
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  flyoutDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 10,
  },
  grandTotalLabelText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#333',
  },
  grandTotalValueText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#333',
  },
  creditToggleSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  creditLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2E7D32',
  },
  creditValue: {
    fontSize: 11,
    color: '#4CAF50',
  },
  toggleBase: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
  },
  toggleOn: {
    backgroundColor: '#4CAF50',
  },
  toggleOff: {
    backgroundColor: '#CCC',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  thumbOn: {
    alignSelf: 'flex-end',
  },
  thumbOff: {
    alignSelf: 'flex-start',
  },
  balanceLabelText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#333',
  },
  balanceValueText: {
    fontSize: 20,
    fontWeight: '900',
  },
  paymentMethodSection: {
    marginTop: 15,
    marginBottom: 10,
  },
  sectionSmallTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  methodGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  methodBtn: {
    flex: 1,
    height: 38,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  activeMethodBtn: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  methodBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
  },
  activeMethodBtnText: {
    color: '#fff',
  },
  confirmSaveBtn: {
    backgroundColor: '#4CAF50',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    elevation: 3,
  },
  confirmSaveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
