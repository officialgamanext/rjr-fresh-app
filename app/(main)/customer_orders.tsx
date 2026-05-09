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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

type FilterType = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'all';
type StatusFilter = 'All' | 'Ordered' | 'Shipped' | 'Delivered';
type PaymentFilter = 'All' | 'Paid' | 'Unpaid';

export default function CustomerOrdersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('today');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Ordered');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('All');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (user?.uid) {
      fetchOrders();
    }
  }, [activeFilter, user, statusFilter, paymentFilter]);

  const fetchOrders = async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const username = user.email.split('@')[0].toLowerCase();
      const empQuery = query(collection(db, 'users'), where('username', '==', username));
      const empSnap = await getDocs(empQuery);
      
      if (empSnap.empty) {
        setLoading(false);
        return;
      }

      const employeeDocId = empSnap.docs[0].id;
      
      const qAssigned = query(collection(db, 'customerOrders'), where('assignedTo', '==', employeeDocId));
      const qEmployee = query(collection(db, 'customerOrders'), where('employeeId', '==', employeeDocId));

      const [snapAssigned, snapEmployee] = await Promise.all([
        getDocs(qAssigned),
        getDocs(qEmployee)
      ]);

      const allOrdersMap = new Map();
      snapAssigned.forEach(doc => allOrdersMap.set(doc.id, { id: doc.id, ...doc.data() }));
      snapEmployee.forEach(doc => allOrdersMap.set(doc.id, { id: doc.id, ...doc.data() }));
      
      const allOrdersList = Array.from(allOrdersMap.values());

      allOrdersList.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      const filtered = filterOrders(allOrdersList);
      setOrders(filtered);
    } catch (error) {
      console.error('Error fetching customer orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOrders = (data: any[]) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const getStartOfWeek = (d: Date) => {
      const date = new Date(d);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(date.setDate(diff));
    };

    return data.filter((order) => {
      // 1. Date Filter
      let passDate = true;
      if (order.createdAt) {
        const orderDate = new Date(order.createdAt);
        orderDate.setHours(0, 0, 0, 0);

        switch (activeFilter) {
          case 'today':
            passDate = orderDate.getTime() === now.getTime();
            break;
          case 'yesterday':
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            passDate = orderDate.getTime() === yesterday.getTime();
            break;
          case 'this_week':
            passDate = orderDate >= getStartOfWeek(now);
            break;
          case 'last_week':
            const startOfLastWeek = getStartOfWeek(now);
            startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
            const endOfLastWeek = getStartOfWeek(now);
            endOfLastWeek.setDate(endOfLastWeek.getDate() - 1);
            passDate = orderDate >= startOfLastWeek && orderDate <= endOfLastWeek;
            break;
          case 'this_month':
            passDate = orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
            break;
          case 'last_month':
            const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
            const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
            passDate = orderDate.getMonth() === lastMonth && orderDate.getFullYear() === year;
            break;
        }
      }

      // 2. Status Filter
      const passStatus = statusFilter === 'All' || order.status === statusFilter;

      // 3. Payment Filter
      const passPayment = paymentFilter === 'All' || order.paymentStatus === paymentFilter;

      return passDate && passStatus && passPayment;
    });
  };

  const handleUpdateOrder = async (orderId: string, updates: any) => {
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'customerOrders', orderId), {
        ...updates,
        updatedAt: new Date().toISOString()
      });
      
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...selectedOrder, ...updates });
      }
    } catch (error) {
      console.error('Error updating order:', error);
      Alert.alert('Update Failed', 'Could not update order details.');
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
          <Text style={styles.orderIdText}>Order #{item.customerId || item.id.slice(-6).toUpperCase()}</Text>
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
          <Ionicons name="person-circle" size={20} color="#2196F3" />
          <View style={{ marginLeft: 8 }}>
            <Text style={styles.shopNameText}>{item.customerName || 'Direct Customer'}</Text>
            <Text style={styles.itemCountText}>{item.customerMobile}</Text>
          </View>
        </View>
        <Text style={styles.totalAmountText}>₹{item.grandTotal}</Text>
      </View>
      
      <View style={styles.orderFooter}>
        <View style={styles.badgeRow}>
          <View style={[styles.miniBadge, { backgroundColor: '#F3E5F5' }]}>
            <Text style={styles.miniBadgeText}>{item.items?.length || 0} Items</Text>
          </View>
          <View style={[styles.miniBadge, { backgroundColor: item.paymentStatus === 'Paid' ? '#E8F5E9' : '#FFEBEE' }]}>
            <Text style={[styles.miniBadgeText, { color: item.paymentStatus === 'Paid' ? '#4CAF50' : '#C62828' }]}>
              {item.paymentStatus || 'Unpaid'}
            </Text>
          </View>
        </View>
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
        <Text style={styles.headerTitle}>Assigned Orders</Text>
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
        
        <View style={styles.secondaryFilters}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.secondaryFiltersContent}>
            <Text style={styles.filterLabel}>Status:</Text>
            {['All', 'Ordered', 'Shipped', 'Delivered'].map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.smallFilterChip, statusFilter === s && styles.activeStatusChip]}
                onPress={() => setStatusFilter(s as StatusFilter)}
              >
                <Text style={[styles.smallFilterText, statusFilter === s && styles.activeStatusText]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.secondaryFiltersContent, { marginTop: 8 }]}>
            <Text style={styles.filterLabel}>Payment:</Text>
            {['All', 'Paid', 'Unpaid'].map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.smallFilterChip, paymentFilter === p && styles.activePaymentChip]}
                onPress={() => setPaymentFilter(p as PaymentFilter)}
              >
                <Text style={[styles.smallFilterText, paymentFilter === p && styles.activePaymentText]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Loading assigned orders...</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="clipboard-outline" size={80} color="#DDD" />
              <Text style={styles.emptyText}>No assigned orders found.</Text>
              <Text style={styles.emptySubText}>Check back later for new tasks.</Text>
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
                <Text style={styles.modalSubtitle}>ID: {selectedOrder?.id?.slice(-8).toUpperCase()}</Text>
              </View>
              <TouchableOpacity onPress={() => setIsDetailModalOpen(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Customer Information</Text>
                <View style={styles.customerCard}>
                  <Text style={styles.detailValue}>{selectedOrder?.customerName}</Text>
                  <Text style={styles.detailLabel}>{selectedOrder?.customerMobile}</Text>
                  <Text style={[styles.detailLabel, { marginTop: 5 }]}>{selectedOrder?.customerAddress}</Text>
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Status Management</Text>
                <View style={styles.statusGrid}>
                  {['Ordered', 'Shipped', 'Delivered'].map((status) => (
                    <TouchableOpacity 
                      key={status}
                      style={[styles.statusOption, selectedOrder?.status === status && styles.activeStatusOption]}
                      onPress={() => handleUpdateOrder(selectedOrder.id, { status: status })}
                    >
                      <Text style={[styles.statusOptionText, selectedOrder?.status === status && styles.activeStatusOptionText]}>
                        {status}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Payment Details</Text>
                <View style={styles.paymentControls}>
                  <View style={styles.controlGroup}>
                    <Text style={styles.controlLabel}>Method</Text>
                    <View style={styles.methodGrid}>
                      {['Cash', 'UPI', 'Card'].map((method) => (
                        <TouchableOpacity 
                          key={method}
                          style={[styles.methodOption, selectedOrder?.paymentMethod === method && styles.activeMethodOption]}
                          onPress={() => handleUpdateOrder(selectedOrder.id, { paymentMethod: method })}
                        >
                          <Text style={[styles.methodOptionText, selectedOrder?.paymentMethod === method && styles.activeMethodOptionText]}>
                            {method}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={[styles.controlGroup, { marginTop: 15 }]}>
                    <Text style={styles.controlLabel}>Status</Text>
                    <View style={styles.methodGrid}>
                      {['Unpaid', 'Paid'].map((pStatus) => (
                        <TouchableOpacity 
                          key={pStatus}
                          style={[styles.methodOption, selectedOrder?.paymentStatus === pStatus && styles.activeMethodOption]}
                          onPress={() => handleUpdateOrder(selectedOrder.id, { paymentStatus: pStatus })}
                        >
                          <Text style={[styles.methodOptionText, selectedOrder?.paymentStatus === pStatus && styles.activeMethodOptionText]}>
                            {pStatus}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
                {updating && <ActivityIndicator size="small" color="#4CAF50" style={{ marginTop: 10 }} />}
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Items Breakdown</Text>
                {selectedOrder?.items?.map((item: any, index: number) => (
                  <View key={index} style={styles.itemDetailRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemNameText}>{item.itemName}</Text>
                      <Text style={styles.itemMetaText}>{item.quantity} x ₹{item.price}</Text>
                    </View>
                    <Text style={styles.itemSubtotalText}>₹{item.subtotal}</Text>
                  </View>
                ))}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Discount</Text>
                  <Text style={[styles.totalValue, { fontSize: 16, color: '#FF5252' }]}>-₹{selectedOrder?.discount || 0}</Text>
                </View>
                <View style={[styles.totalRow, { marginTop: 0, paddingTop: 10, borderTopWidth: 0 }]}>
                  <Text style={styles.totalLabel}>Return Amount</Text>
                  <Text style={[styles.totalValue, { fontSize: 16, color: '#FF5252' }]}>-₹{selectedOrder?.returnAmount || 0}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Grand Total</Text>
                  <Text style={styles.totalValue}>₹{selectedOrder?.grandTotal}</Text>
                </View>
              </View>

              <TouchableOpacity 
                style={styles.modalFooterCloseBtn}
                onPress={() => setIsDetailModalOpen(false)}
              >
                <Text style={styles.modalFooterCloseText}>Close Details</Text>
              </TouchableOpacity>
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
    paddingBottom: 10,
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
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  filterText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  activeFilterText: {
    color: '#2196F3',
  },
  secondaryFilters: {
    paddingHorizontal: 20,
    marginTop: 5,
  },
  secondaryFiltersContent: {
    alignItems: 'center',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    marginRight: 10,
    textTransform: 'uppercase',
  },
  smallFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  activeStatusChip: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  activePaymentChip: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  smallFilterText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  activeStatusText: {
    color: '#4CAF50',
  },
  activePaymentText: {
    color: '#2196F3',
  },
  listContent: {
    padding: 20,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 25,
    padding: 15,
    marginBottom: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
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
  },
  orderDateText: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  orderBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
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
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  totalAmountText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#333',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  badgeRow: {
    flexDirection: 'row',
  },
  miniBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 8,
  },
  miniBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#666',
  },
  itemCountText: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  filterList: {
    paddingHorizontal: 20,
    paddingBottom: 5,
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
    paddingHorizontal: 40,
  },
  emptyText: {
    marginTop: 15,
    fontSize: 18,
    color: '#333',
    fontWeight: '800',
  },
  emptySubText: {
    marginTop: 5,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    maxHeight: '90%',
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
    fontSize: 22,
    fontWeight: '800',
    color: '#333',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  modalBody: {
    padding: 25,
  },
  detailSection: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 15,
  },
  customerCard: {
    backgroundColor: '#F5F9FF',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3F2FD',
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  statusOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  activeStatusOption: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  statusOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
  },
  activeStatusOptionText: {
    color: '#4CAF50',
  },
  paymentControls: {
    backgroundColor: '#fff',
  },
  controlGroup: {
    marginBottom: 5,
  },
  controlLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
  },
  methodGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  methodOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  activeMethodOption: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  methodOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
  },
  activeMethodOptionText: {
    color: '#2196F3',
  },
  itemDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F9F9F9',
  },
  itemNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  itemMetaText: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  itemSubtotalText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#333',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#333',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#4CAF50',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#333',
  },
  modalFooterCloseBtn: {
    backgroundColor: '#F1F3F5',
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  modalFooterCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#666',
  },
});
