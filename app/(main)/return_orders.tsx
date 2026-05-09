import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Modal,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  writeBatch, 
  getDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';

type FilterType = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all';

export default function ReturnOrdersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  // List State
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('today');
  const [selectedReturn, setSelectedReturn] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Add Return State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [autoSelecting, setAutoSelecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [shops, setShops] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [selectedShop, setSelectedShop] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [returnItems, setReturnItems] = useState<any>({}); // { itemId: { returnQty: 0, batchNumber: '' } }
  const [activeCheckInId, setActiveCheckInId] = useState<string | null>(null);

  // 1. Fetch Return History
  useEffect(() => {
    fetchReturns();
  }, [activeFilter, user]);

  const fetchReturns = async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const username = user.email.split('@')[0].toLowerCase();
      const empQ = query(collection(db, 'users'), where('username', '==', username));
      const empSnap = await getDocs(empQ);
      let employeeId = user.uid;
      if (!empSnap.empty) employeeId = empSnap.docs[0].id;

      // Query returns created by this employee
      // In Admin, returns don't always have employeeId, but we'll try to find them if they do
      const q = query(
        collection(db, 'returns'),
        where('employeeId', '==', employeeId)
      );

      const snap = await getDocs(q);
      const all: any[] = [];
      snap.forEach(doc => all.push({ id: doc.id, ...doc.data() }));
      
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setReturns(filterReturns(all, activeFilter));
    } catch (error) {
      console.error("Error fetching returns:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterReturns = (data: any[], filter: FilterType) => {
    if (filter === 'all') return data;
    const now = new Date();
    now.setHours(0,0,0,0);
    return data.filter(r => {
      if (!r.createdAt) return false;
      const d = new Date(r.createdAt);
      d.setHours(0,0,0,0);
      if (filter === 'today') return d.getTime() === now.getTime();
      if (filter === 'yesterday') {
        const y = new Date(now); y.setDate(now.getDate() - 1);
        return d.getTime() === y.getTime();
      }
      if (filter === 'this_week') {
        const sw = new Date(now); sw.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
        return d >= sw;
      }
      if (filter === 'this_month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      return true;
    });
  };

  // 2. Add Return Logic
  useEffect(() => {
    if (isAddModalOpen) {
      setSelectedLocationId('');
      setSelectedShop(null);
      setSelectedOrder(null);
      setReturnItems({});
      setAutoSelecting(true);
      fetchLocations();
      checkCheckInStatus();
    }
  }, [isAddModalOpen]);

  const checkCheckInStatus = async () => {
    if (!user?.uid) return;
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const q = query(
        collection(db, 'checkins'),
        where('userId', '==', user.uid),
        where('date', '==', today)
      );
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        
        const lastCheckIn = docs[0];
        if (lastCheckIn.shopId) {
          console.log('ReturnOrders: Active check-in found for shop:', lastCheckIn.shopName);
          setActiveCheckInId(lastCheckIn.id);
          
          const shopRef = doc(db, 'stores', lastCheckIn.shopId);
          const shopSnap = await getDoc(shopRef);
          
          if (shopSnap.exists()) {
            const shopData = { id: shopSnap.id, ...shopSnap.data() };
            const locationId = shopData.locationId || lastCheckIn.locationId;
            
            if (locationId) {
              setSelectedLocationId(locationId);
              const shopsQ = query(collection(db, 'stores'), where('locationId', '==', locationId));
              const shopsSnap = await getDocs(shopsQ);
              setShops(shopsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            }
            
            handleShopSelect(shopData);
          }
        } else {
          setActiveCheckInId(null);
        }
      } else {
        setActiveCheckInId(null);
      }
    } catch (err) {
      console.error('ReturnOrders: Error checking check-in status:', err);
    } finally {
      setAutoSelecting(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const snap = await getDocs(collection(db, 'locations'));
      setLocations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) { console.error(e); }
  };

  const handleLocationSelect = async (locId: string) => {
    setSelectedLocationId(locId);
    setSelectedShop(null);
    setSelectedOrder(null);
    try {
      const q = query(collection(db, 'stores'), where('locationId', '==', locId));
      const snap = await getDocs(q);
      setShops(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) { console.error(e); }
  };

  const handleShopSelect = async (shop: any) => {
    setSelectedShop(shop);
    setSelectedOrder(null);
    setLoadingOrders(true);
    try {
      const q = query(
        collection(db, 'orders'), 
        where('shopId', '==', shop.id), 
        limit(30)
      );
      const snap = await getDocs(q);
      const allOrders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      allOrders.sort((a: any, b: any) => {
        const dateA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const dateB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setRecentOrders(allOrders);
    } catch (e) { console.error(e); } finally { setLoadingOrders(false); }
  };

  const handleOrderSelect = (order: any) => {
    setSelectedOrder(order);
    const initial: any = {};
    order.items.forEach((item: any) => {
      const availableQty = (item.quantity || 0) - (item.returnedQty || 0);
      initial[item.itemId] = {
        returnQty: 0,
        batchNumber: item.batchNumber || '',
        price: item.price,
        itemName: item.itemName || item.name,
        maxQty: availableQty
      };
    });
    setReturnItems(initial);
  };

  const handleQtyChange = (itemId: string, qty: string) => {
    const val = parseInt(qty) || 0;
    const max = returnItems[itemId].maxQty;
    const finalVal = Math.min(Math.max(0, val), max);
    setReturnItems({ ...returnItems, [itemId]: { ...returnItems[itemId], returnQty: finalVal } });
  };

  const calculateRefund = () => {
    return Object.values(returnItems).reduce((sum: number, item: any) => sum + (item.returnQty * item.price), 0);
  };

  const handleSaveReturn = async () => {
    const refund = calculateRefund();
    if (refund <= 0) return Alert.alert("Error", "Select at least one item to return.");

    setSaving(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Prepare returned items list and update order items with returnedQty
      const returnedItemsList: any[] = [];
      const updatedOrderItems = selectedOrder.items.map((item: any) => {
        const ret = returnItems[item.itemId];
        if (ret && ret.returnQty > 0) {
          returnedItemsList.push({
            itemId: item.itemId,
            itemName: ret.itemName,
            quantity: ret.returnQty,
            price: ret.price,
            batchNumber: ret.batchNumber,
            subtotal: ret.returnQty * ret.price
          });
          return {
            ...item,
            returnedQty: (item.returnedQty || 0) + ret.returnQty
          };
        }
        return item;
      });

      const newReturnAmount = (parseFloat(selectedOrder.returnAmount || 0)) + refund;
      const fixedSubtotal = parseFloat(selectedOrder.totalSubtotal || 0);
      const discount = parseFloat(selectedOrder.discount || 0);
      const creditsUsed = parseFloat(selectedOrder.creditsUsed || 0);
      
      const newGrandTotal = Math.max(0, fixedSubtotal - discount - creditsUsed - newReturnAmount);
      
      let creditToAdd = 0;
      let newPayStatus = selectedOrder.paymentStatus;
      const received = selectedOrder.paymentReceived || 0;

      if (selectedOrder.paymentStatus === 'Paid') {
        creditToAdd = refund;
      } else {
        if (received > newGrandTotal) {
          creditToAdd = received - newGrandTotal;
          newPayStatus = 'Paid';
        } else {
          newPayStatus = received >= newGrandTotal ? 'Paid' : (received > 0 ? 'Partial' : 'Unpaid');
        }
      }

      // 2. Update Order (Keep Subtotal Fixed)
      const orderUpdateData = {
        items: updatedOrderItems,
        returnAmount: newReturnAmount,
        grandTotal: newGrandTotal,
        balance: Math.max(0, newGrandTotal - (selectedOrder.paymentReceived || 0)),
        paymentStatus: newPayStatus,
        updatedAt: new Date().toISOString()
      };
      
      batch.update(doc(db, 'orders', selectedOrder.id), orderUpdateData);
      batch.update(doc(db, `stores/${selectedShop.id}/sales`, selectedOrder.id), orderUpdateData);

      // 3. Update Shop Credits
      const username = user?.email?.split('@')[0].toLowerCase();
      const empQ = query(collection(db, 'users'), where('username', '==', username));
      const empSnap = await getDocs(empQ);
      let employeeId = user?.uid;
      let employeeName = user?.displayName || 'N/A';
      if (!empSnap.empty) {
        const empData = empSnap.docs[0].data();
        employeeId = empSnap.docs[0].id;
        employeeName = empData.name || employeeName;
      }

      if (creditToAdd > 0) {
        const shopRef = doc(db, 'stores', selectedShop.id);
        const shopSnap = await getDoc(shopRef);
        const currentCredits = shopSnap.exists() ? (shopSnap.data().credits || 0) : 0;
        batch.update(shopRef, { credits: currentCredits + creditToAdd });

        // Add credit history (Global and Subcollection)
        const creditHistData = {
          shopId: selectedShop.id,
          amount: creditToAdd,
          type: 'return',
          description: `Return for order #${selectedOrder.id.slice(-6).toUpperCase()}`,
          createdAt: new Date().toISOString(),
          employeeId: employeeId,
          employeeName: employeeName
        };
        batch.set(doc(collection(db, 'creditHistory')), creditHistData);
        batch.set(doc(collection(db, `stores/${selectedShop.id}/creditHistory`)), creditHistData);
      }

      // 4. Save Return Record (Global and Subcollection)
      const returnRecordData = {
        shopId: selectedShop.id,
        shopName: selectedShop.name,
        locationId: selectedShop.locationId,
        orderId: selectedOrder.id,
        items: returnedItemsList,
        totalRefund: refund,
        creditAdded: creditToAdd,
        createdAt: new Date().toISOString(),
        employeeId: employeeId,
        employeeName: employeeName,
        checkinId: activeCheckInId
      };
      batch.set(doc(collection(db, 'returns')), returnRecordData);
      batch.set(doc(collection(db, `stores/${selectedShop.id}/returns`)), returnRecordData);

      await batch.commit();
      Alert.alert("Success", `Return processed! ₹${creditToAdd} added to credits.`);
      setIsAddModalOpen(false);
      fetchReturns();
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to process return.");
    } finally { setSaving(false); }
  };

  const renderReturnItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.returnCard}
      onPress={() => { setSelectedReturn(item); setIsDetailModalOpen(true); }}
    >
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardShopName}>{item.shopName}</Text>
          <Text style={styles.cardDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        <View style={styles.refundBadge}>
          <Text style={styles.refundLabel}>Refund</Text>
          <Text style={styles.refundValue}>₹{item.totalRefund}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardItemsCount}>{item.items?.length || 0} items returned</Text>
        <Ionicons name="chevron-forward" size={18} color="#4CAF50" />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Return Orders</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setIsAddModalOpen(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.filtersWrapper}>
        <FlatList
          data={[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'this_week', label: 'This Week' },
            { id: 'this_month', label: 'This Month' },
            { id: 'all', label: 'All' },
          ]}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={[styles.filterChip, activeFilter === item.id && styles.activeFilterChip]}
              onPress={() => setActiveFilter(item.id as FilterType)}
            >
              <Text style={[styles.filterText, activeFilter === item.id && styles.activeFilterText]}>{item.label}</Text>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}
        />
      </View>

      {loading ? (
        <View style={styles.centerContent}><ActivityIndicator size="large" color="#4CAF50" /><Text style={styles.loadingText}>Loading returns...</Text></View>
      ) : (
        <FlatList
          data={returns}
          renderItem={renderReturnItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="refresh-circle-outline" size={80} color="#DDD" />
              <Text style={styles.emptyText}>No return orders found.</Text>
            </View>
          }
        />
      )}

      {/* Add Return Modal */}
      <Modal visible={isAddModalOpen} animationType="slide" onRequestClose={() => setIsAddModalOpen(false)}>
        <SafeAreaView style={styles.modalFullContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setIsAddModalOpen(false)}><Ionicons name="close" size={28} color="#333" /></TouchableOpacity>
            <Text style={styles.modalTitle}>Process Return</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView 
            style={styles.modalBody} 
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {autoSelecting ? (
              <View style={styles.centerLoader}>
                <ActivityIndicator size="large" color="#4CAF50" />
                <Text style={styles.loaderText}>Verifying check-in status...</Text>
              </View>
            ) : !selectedShop ? (
              <View style={styles.selectionSection}>
                <Text style={styles.sectionLabel}>1. Select Shop Location</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                  {locations.map(loc => (
                    <TouchableOpacity 
                      key={loc.id} 
                      style={[styles.locChip, selectedLocationId === loc.id && styles.activeLocChip]}
                      onPress={() => handleLocationSelect(loc.id)}
                    >
                      <Text style={[styles.locChipText, selectedLocationId === loc.id && styles.activeLocChipText]}>{loc.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                
                {selectedLocationId ? (
                  <>
                    <Text style={styles.sectionLabel}>2. Select Shop</Text>
                    <View style={styles.shopGrid}>
                      {shops.map(s => (
                        <TouchableOpacity key={s.id} style={styles.shopSelectCard} onPress={() => handleShopSelect(s)}>
                          <Text style={styles.shopSelectName}>{s.name}</Text>
                          <Ionicons name="chevron-forward" size={16} color="#4CAF50" />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : <Text style={styles.hintText}>Please select a location first.</Text>}
              </View>
            ) : (
              <View style={styles.activeShopHeader}>
                <View style={styles.activeShopInfo}>
                  <Ionicons name="storefront" size={24} color="#4CAF50" />
                  <View>
                    <Text style={styles.activeShopName}>{selectedShop.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.locationLabel}>{selectedShop.locationName || 'Linked Shop'}</Text>
                      {activeCheckInId && <Text style={styles.linkedText}> • Active Visit</Text>}
                    </View>
                  </View>
                </View>
                {!activeCheckInId && (
                  <TouchableOpacity onPress={() => { setSelectedShop(null); setSelectedOrder(null); }}>
                    <Text style={styles.changeBtnText}>Change</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Order Selection */}
            {selectedShop && (
              <View style={styles.orderSection}>
                <Text style={styles.sectionLabel}>Select Recent Order</Text>
                {loadingOrders ? (
                  <ActivityIndicator color="#4CAF50" style={{ margin: 20 }} />
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                    {recentOrders.length > 0 ? (
                      recentOrders.map(o => (
                        <TouchableOpacity 
                          key={o.id} 
                          style={[styles.orderChipMedium, selectedOrder?.id === o.id && styles.activeOrderChipMedium]}
                          onPress={() => handleOrderSelect(o)}
                        >
                          <View style={styles.orderChipHeader}>
                            <Text style={[styles.orderChipId, selectedOrder?.id === o.id && styles.activeOrderChipText]} numberOfLines={1}>#{o.id.slice(-6).toUpperCase()}</Text>
                            <Text style={[styles.orderChipPriceSmall, selectedOrder?.id === o.id && styles.activeOrderChipText]}>₹{o.grandTotal || o.totalSubtotal || 0}</Text>
                          </View>
                          <Text style={[styles.orderChipDate, selectedOrder?.id === o.id && styles.activeOrderChipText]}>{new Date(o.createdAt).toLocaleDateString()}</Text>
                          <View style={[styles.statusBadgeLarge, o.paymentStatus === 'Paid' ? styles.statusPaid : (o.paymentStatus === 'Partial' ? styles.statusPartial : styles.statusUnpaid)]}>
                            <Text style={styles.statusBadgeTextLarge}>{o.paymentStatus || 'Unpaid'}</Text>
                          </View>
                        </TouchableOpacity>
                      ))
                    ) : (
                      <View style={styles.emptyRecentOrdersSmall}>
                        <Text style={styles.hintTextSmall}>No recent orders.</Text>
                      </View>
                    )}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Items Listing */}
            {selectedOrder && (
              <View style={styles.itemsSection}>
                <Text style={styles.sectionLabel}>Return Quantities</Text>
                {selectedOrder.items.map((item: any) => (
                  <View key={item.itemId} style={styles.returnItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.itemName || item.name}</Text>
                      <Text style={styles.itemMeta}>Max Qty: {item.quantity} | ₹{item.price}</Text>
                    </View>
                    <View style={styles.qtyControlRow}>
                      <TouchableOpacity 
                        style={styles.qtyBtnSmall}
                        onPress={() => {
                          const curQty = returnItems[item.itemId]?.returnQty || 0;
                          if (curQty > 0) handleQtyChange(item.itemId, (curQty - 1).toString());
                        }}
                      >
                        <Ionicons name="remove" size={16} color="#666" />
                      </TouchableOpacity>
                      
                      <TextInput
                        style={styles.qtyInput}
                        keyboardType="numeric"
                        placeholder="0"
                        value={returnItems[item.itemId]?.returnQty.toString() || '0'}
                        onChangeText={(val) => handleQtyChange(item.itemId, val)}
                      />

                      <TouchableOpacity 
                        style={styles.qtyBtnSmall}
                        onPress={() => {
                          const curQty = returnItems[item.itemId]?.returnQty || 0;
                          handleQtyChange(item.itemId, (curQty + 1).toString());
                        }}
                      >
                        <Ionicons name="add" size={16} color="#4CAF50" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <View style={styles.refundSummary}>
                  <Text style={styles.refundSumLabel}>Total Refund Value</Text>
                  <Text style={styles.refundSumValue}>₹{calculateRefund()}</Text>
                </View>
                <Text style={styles.hintTextSmall}>Refunds are added to shop credits for paid orders or reduce the balance for unpaid orders.</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity 
              style={[styles.processBtn, (!selectedOrder || calculateRefund() <= 0) && styles.disabledBtn]}
              disabled={saving || !selectedOrder || calculateRefund() <= 0}
              onPress={handleSaveReturn}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.processBtnText}>Process Return</Text>}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={isDetailModalOpen} transparent animationType="fade" onRequestClose={() => setIsDetailModalOpen(false)}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailContent}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Return Details</Text>
              <TouchableOpacity onPress={() => setIsDetailModalOpen(false)}><Ionicons name="close" size={24} color="#333" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.detailSummaryRow}>
                <View>
                  <Text style={styles.detailShopName}>{selectedReturn?.shopName}</Text>
                  <Text style={styles.detailOrderRef}>Ref Order: #{selectedReturn?.orderId?.slice(-6).toUpperCase()}</Text>
                </View>
                <View style={styles.detailRefundBox}>
                  <Text style={styles.detailRefundAmt}>₹{selectedReturn?.totalRefund}</Text>
                </View>
              </View>
              <View style={styles.detailDivider} />
              <Text style={styles.detailSectionTitle}>Returned Items</Text>
              {selectedReturn?.items?.map((i: any, idx: number) => (
                <View key={idx} style={styles.detailItemRow}>
                  <View>
                    <Text style={styles.detailItemName}>{i.itemName}</Text>
                    <Text style={styles.detailItemMeta}>{i.quantity} x ₹{i.price}</Text>
                  </View>
                  <Text style={styles.detailItemSub}>₹{i.subtotal}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#333' },
  addButton: { backgroundColor: '#4CAF50', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4 },
  filtersWrapper: { backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  filtersContent: { paddingHorizontal: 20 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F3F5', marginRight: 10, borderWidth: 1, borderColor: '#EEE' },
  activeFilterChip: { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' },
  filterText: { fontSize: 13, color: '#666', fontWeight: '700' },
  activeFilterText: { color: '#4CAF50' },
  listContent: { padding: 20 },
  returnCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardShopName: { fontSize: 16, fontWeight: '800', color: '#333', marginBottom: 2 },
  cardDate: { fontSize: 12, color: '#999' },
  refundBadge: { alignItems: 'flex-end' },
  refundLabel: { fontSize: 10, color: '#999', textTransform: 'uppercase', fontWeight: '700' },
  refundValue: { fontSize: 18, fontWeight: '900', color: '#4CAF50' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F8F9FA' },
  cardItemsCount: { fontSize: 12, color: '#666', fontWeight: '600' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#666' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  emptyText: { marginTop: 10, fontSize: 16, color: '#999', fontWeight: '600' },
  // Modal Styles
  modalFullContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#333' },
  modalBody: { flex: 1, padding: 20 },
  selectionSection: { marginBottom: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '800', color: '#333', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  locChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F0F0F0', marginRight: 8, borderWidth: 1, borderColor: '#DDD' },
  activeLocChip: { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' },
  locChipText: { fontSize: 13, color: '#666', fontWeight: '600' },
  activeLocChipText: { color: '#4CAF50' },
  shopGrid: { gap: 10 },
  shopSelectCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#F8F9FA', borderRadius: 15, borderWidth: 1, borderColor: '#EEE' },
  shopSelectName: { fontSize: 15, fontWeight: '700', color: '#333' },
  activeShopHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E8F5E9', padding: 15, borderRadius: 15, marginBottom: 20 },
  activeShopInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activeShopName: { fontSize: 16, fontWeight: '800', color: '#2E7D32' },
  locationLabel: { fontSize: 12, color: '#666', fontWeight: '600' },
  changeBtnText: { color: '#4CAF50', fontWeight: '800', fontSize: 12 },
  orderSection: { marginTop: 10 },
  orderChipMedium: { 
    padding: 15, 
    borderRadius: 18, 
    backgroundColor: '#fff', 
    marginRight: 12, 
    alignItems: 'flex-start', 
    borderWidth: 1, 
    borderColor: '#EEE', 
    width: 160,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5
  },
  activeOrderChipMedium: { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' },
  orderChipHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 6 },
  orderChipId: { fontSize: 13, fontWeight: '800', color: '#333' },
  orderChipPriceSmall: { fontSize: 12, fontWeight: '700', color: '#666' },
  activeOrderChipText: { color: '#2E7D32' },
  statusBadgeLarge: { width: '100%', paddingVertical: 4, borderRadius: 8, alignItems: 'center', marginTop: 8, backgroundColor: '#999' },
  statusPaid: { backgroundColor: '#4CAF50' },
  statusPartial: { backgroundColor: '#FF9800' },
  statusUnpaid: { backgroundColor: '#F44336' },
  statusBadgeTextLarge: { fontSize: 11, fontWeight: '900', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
  orderChipDate: { fontSize: 11, color: '#999', marginBottom: 2 },
  emptyRecentOrdersSmall: { padding: 15, backgroundColor: '#F8F9FA', borderRadius: 15, borderStyle: 'dashed', borderWidth: 1, borderColor: '#DDD' },
  itemsSection: { marginTop: 20, paddingBottom: 80 },
  returnItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  itemName: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 2 },
  itemMeta: { fontSize: 12, color: '#999' },
  qtyControlRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtnSmall: { width: 38, height: 38, backgroundColor: '#F8F9FA', borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EEE' },
  qtyInput: { backgroundColor: '#F1F3F5', borderRadius: 10, height: 40, width: 55, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#333', borderWidth: 1, borderColor: '#E9ECEF' },
  refundSummary: { marginTop: 25, backgroundColor: '#F8F9FA', padding: 20, borderRadius: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#EEE' },
  refundSumLabel: { fontSize: 14, fontWeight: '700', color: '#666' },
  refundSumValue: { fontSize: 24, fontWeight: '900', color: '#4CAF50' },
  hintText: { color: '#999', textAlign: 'center', marginVertical: 40 },
  hintTextSmall: { fontSize: 11, color: '#999', marginTop: 10, textAlign: 'center' },
  modalFooter: { padding: 20, borderTopWidth: 1, borderTopColor: '#EEE' },
  processBtn: { backgroundColor: '#4CAF50', padding: 16, borderRadius: 15, alignItems: 'center', elevation: 3 },
  disabledBtn: { backgroundColor: '#CCC', elevation: 0 },
  processBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  centerLoader: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loaderText: { marginTop: 10, color: '#666', fontSize: 14 },
  // Detail Overlay
  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  detailContent: { backgroundColor: '#fff', borderRadius: 25, padding: 20, maxHeight: '80%' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  detailTitle: { fontSize: 20, fontWeight: '900', color: '#333' },
  detailSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  detailShopName: { fontSize: 18, fontWeight: '800', color: '#333' },
  detailOrderRef: { fontSize: 12, color: '#999', marginTop: 4 },
  detailRefundBox: { backgroundColor: '#E8F5E9', padding: 10, borderRadius: 12 },
  detailRefundAmt: { fontSize: 20, fontWeight: '900', color: '#4CAF50' },
  detailDivider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 15 },
  detailSectionTitle: { fontSize: 12, fontWeight: '800', color: '#999', textTransform: 'uppercase', marginBottom: 15 },
  detailItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  detailItemName: { fontSize: 14, fontWeight: '700', color: '#333' },
  detailItemMeta: { fontSize: 11, color: '#999' },
  detailItemSub: { fontSize: 14, fontWeight: '800', color: '#333' },
  linkedText: { fontSize: 10, color: '#2E7D32', fontWeight: '600', opacity: 0.8 },
});
