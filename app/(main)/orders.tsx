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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

type FilterType = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

export default function OrdersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('today');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, [activeFilter, user]);

  const fetchOrders = async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      // 1. Get Employee Document ID
      const username = user.email.split('@')[0].toLowerCase();
      const empQuery = query(collection(db, 'employees'), where('username', '==', username));
      const empSnap = await getDocs(empQuery);
      
      if (empSnap.empty) {
        setLoading(false);
        return;
      }
      
      const employeeDocId = empSnap.docs[0].id;

      // 2. Query only the 'orders' collection (My Sale Orders)
      const shopOrdersQuery = query(
        collection(db, 'orders'),
        where('employeeId', '==', employeeDocId)
      );

      const snap = await getDocs(shopOrdersQuery);
      const allOrders: any[] = [];
      snap.forEach((doc) => allOrders.push({ id: doc.id, ...doc.data() }));

      // Sort locally
      allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const filtered = filterOrders(allOrders, activeFilter);
      setOrders(filtered);
    } catch (error) {
      console.error('Error fetching my orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOrders = (data: any[], filter: FilterType) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const getStartOfWeek = (d: Date) => {
      const date = new Date(d);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(date.setDate(diff));
    };

    return data.filter((order) => {
      const orderDate = new Date(order.createdAt);
      orderDate.setHours(0, 0, 0, 0);

      switch (filter) {
        case 'today':
          return orderDate.getTime() === now.getTime();
        case 'yesterday':
          const yesterday = new Date(now);
          yesterday.setDate(now.getDate() - 1);
          return orderDate.getTime() === yesterday.getTime();
        case 'this_week':
          const startOfWeek = getStartOfWeek(now);
          return orderDate >= startOfWeek;
        case 'last_week':
          const startOfLastWeek = getStartOfWeek(now);
          startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
          const endOfLastWeek = getStartOfWeek(now);
          endOfLastWeek.setDate(endOfLastWeek.getDate() - 1);
          return orderDate >= startOfLastWeek && orderDate <= endOfLastWeek;
        case 'this_month':
          return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
        case 'last_month':
          const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
          const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
          return orderDate.getMonth() === lastMonth && orderDate.getFullYear() === year;
        default:
          return true;
      }
    });
  };

  const handleUpdateOrder = async (orderId: string, collectionName: string, updates: any) => {
    setUpdating(true);
    try {
      await updateDoc(doc(db, collectionName, orderId), {
        ...updates,
        updatedAt: new Date().toISOString()
      });
      // Update local state
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...selectedOrder, ...updates });
      }
    } catch (error) {
      console.error('Error updating order:', error);
    } finally {
      setUpdating(false);
    }
  };

  const renderOrderItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.orderCard}
      onPress={() => {
        setSelectedOrder(item);
        setIsDetailModalOpen(true);
      }}
      activeOpacity={0.7}
    >
      <View style={styles.orderHeader}>
        <View>
          <Text style={styles.orderIdText}>Order #{item.orderId || item.id.slice(-6).toUpperCase()}</Text>
          <Text style={styles.orderDateText}>{new Date(item.createdAt).toLocaleString()}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: item.status === 'Delivered' ? '#E8F5E9' : '#FFF3E0' }]}>
          <Text style={[styles.statusText, { color: item.status === 'Delivered' ? '#4CAF50' : '#FF9800' }]}>
            {item.status || 'Pending'}
          </Text>
        </View>
      </View>
      
      <View style={styles.orderBody}>
        <View style={styles.shopInfo}>
          <Ionicons name={item.collectionName === 'customerOrders' ? "person-outline" : "storefront-outline"} size={16} color="#666" />
          <Text style={styles.shopNameText}>{item.customerName || item.shopName}</Text>
          {item.collectionName === 'customerOrders' && (
            <View style={styles.b2cBadge}><Text style={styles.b2cText}>B2C</Text></View>
          )}
        </View>
        <Text style={styles.totalAmountText}>₹{item.grandTotal}</Text>
      </View>
      
      <View style={styles.orderFooter}>
        <Text style={styles.itemCountText}>{item.items?.length || 0} items • {item.paymentStatus}</Text>
        <Ionicons name="chevron-forward" size={20} color="#CCC" />
      </View>
    </TouchableOpacity>
  );

  const FilterChip = ({ type, label }: { type: FilterType, label: string }) => (
    <TouchableOpacity
      style={[styles.filterChip, activeFilter === type && styles.activeFilterChip]}
      onPress={() => setActiveFilter(type)}
    >
      <Text style={[styles.filterText, activeFilter === type && styles.activeFilterText]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Sale Orders</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filtersWrapper}>
        <FlatList
          data={[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'this_week', label: 'This Week' },
            { id: 'last_week', label: 'Last Week' },
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
          ]}
          renderItem={({ item }) => <FilterChip type={item.id as FilterType} label={item.label} />}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}
        />
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Fetching orders...</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={80} color="#DDD" />
              <Text style={styles.emptyText}>No orders found for this period.</Text>
            </View>
          }
        />
      )}

      <Modal
        visible={isDetailModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsDetailModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Order Details</Text>
                <Text style={styles.modalSubtitle}>#{selectedOrder?.id?.slice(-6).toUpperCase()}</Text>
              </View>
              <TouchableOpacity onPress={() => setIsDetailModalOpen(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>{selectedOrder?.collectionName === 'customerOrders' ? 'Customer' : 'Shop'} Information</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Name</Text>
                  <Text style={styles.detailValue}>{selectedOrder?.customerName || selectedOrder?.shopName}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Current Status</Text>
                  <Text style={[styles.detailValue, { color: selectedOrder?.status === 'Delivered' ? '#4CAF50' : '#FF9800' }]}>
                    {selectedOrder?.status}
                  </Text>
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Items</Text>
                {selectedOrder?.items?.map((item: any, index: number) => (
                  <View key={index} style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemNameText}>{item.itemName}</Text>
                      <Text style={styles.itemMetaText}>{item.quantity} x ₹{item.price}</Text>
                    </View>
                    <Text style={styles.itemSubtotalText}>₹{item.subtotal}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Payment Summary</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Grand Total</Text>
                  <Text style={styles.grandTotalValue}>₹{selectedOrder?.grandTotal}</Text>
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Update Status & Payment</Text>
                
                <Text style={styles.inputLabel}>Order Status</Text>
                <View style={styles.pickerContainer}>
                  {['Ordered', 'Shipped', 'Delivered'].map((status) => (
                    <TouchableOpacity 
                      key={status}
                      style={[styles.statusButton, selectedOrder?.status === status && styles.activeStatus]}
                      onPress={() => handleUpdateOrder(selectedOrder.id, selectedOrder.collectionName, { status: status })}
                    >
                      <Text style={[styles.statusButtonText, selectedOrder?.status === status && styles.activeStatusText]}>{status}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.inputLabel, { marginTop: 15 }]}>Payment Status</Text>
                <View style={styles.pickerContainer}>
                  {['Unpaid', 'Paid'].map((pStatus) => (
                    <TouchableOpacity 
                      key={pStatus}
                      style={[styles.statusButton, selectedOrder?.paymentStatus === pStatus && styles.activeStatus]}
                      onPress={() => handleUpdateOrder(selectedOrder.id, selectedOrder.collectionName, { paymentStatus: pStatus })}
                    >
                      <Text style={[styles.statusButtonText, selectedOrder?.paymentStatus === pStatus && styles.activeStatusText]}>{pStatus}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.inputLabel, { marginTop: 15 }]}>Payment Method</Text>
                <View style={styles.pickerContainer}>
                  {['Cash', 'UPI', 'Card'].map((method) => (
                    <TouchableOpacity 
                      key={method}
                      style={[styles.methodButton, selectedOrder?.paymentMethod === method && styles.activeMethod]}
                      onPress={() => handleUpdateOrder(selectedOrder.id, selectedOrder.collectionName, { paymentMethod: method })}
                    >
                      <Text style={[styles.methodButtonText, selectedOrder?.paymentMethod === method && styles.activeMethodText]}>{method}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                
                {updating && <ActivityIndicator size="small" color="#4CAF50" style={{ marginTop: 10 }} />}
              </View>
            </ScrollView>
          </View>
        </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  filtersWrapper: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  filtersContent: {
    paddingHorizontal: 20,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F1F1',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  activeFilterChip: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  filterText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  activeFilterText: {
    color: '#4CAF50',
  },
  listContent: {
    padding: 20,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 15,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderIdText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#333',
    marginBottom: 2,
  },
  orderDateText: {
    fontSize: 12,
    color: '#999',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  orderBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F9F9F9',
  },
  shopInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  shopNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 6,
  },
  totalAmountText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#333',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  itemCountText: {
    fontSize: 13,
    color: '#999',
    fontWeight: '600',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    color: '#666',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyText: {
    marginTop: 15,
    fontSize: 16,
    color: '#999',
    fontWeight: '600',
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
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#333',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#999',
    textTransform: 'uppercase',
  },
  modalBody: {
    padding: 20,
  },
  detailSection: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  itemNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginBottom: 2,
  },
  itemMetaText: {
    fontSize: 12,
    color: '#666',
  },
  itemSubtotalText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 15,
  },
  grandTotalValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#4CAF50',
  },
  b2cBadge: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  b2cText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#C62828',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statusButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  activeStatus: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  statusButtonText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  activeStatusText: {
    color: '#4CAF50',
  },
  methodButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#DDD',
    minWidth: 70,
    alignItems: 'center',
  },
  activeMethod: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  methodButtonText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  activeMethodText: {
    color: '#2196F3',
  },
});
