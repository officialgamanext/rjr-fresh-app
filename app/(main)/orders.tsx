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
import { collection, query, where, getDocs } from 'firebase/firestore';

type FilterType = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all';

export default function OrdersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('today');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, [activeFilter, user]);

  const fetchOrders = async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const username = user.email.split('@')[0].toLowerCase();
      const empQ = query(collection(db, 'employees'), where('username', '==', username));
      const empSnap = await getDocs(empQ);
      
      let employeeId = user.uid;
      if (!empSnap.empty) {
        employeeId = empSnap.docs[0].id;
      }

      const q = query(
        collection(db, 'orders'),
        where('employeeId', '==', employeeId)
      );

      const snap = await getDocs(q);
      const allOrders: any[] = [];
      snap.forEach((doc) => allOrders.push({ id: doc.id, ...doc.data() }));

      allOrders.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      const filtered = filterOrders(allOrders, activeFilter);
      setOrders(filtered);
    } catch (error) {
      console.error('Error fetching my orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOrders = (data: any[], filter: FilterType) => {
    if (filter === 'all') return data;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return data.filter((order) => {
      if (!order.createdAt) return false;
      const orderDate = new Date(order.createdAt);
      orderDate.setHours(0, 0, 0, 0);

      switch (filter) {
        case 'today': return orderDate.getTime() === now.getTime();
        case 'yesterday':
          const yesterday = new Date(now);
          yesterday.setDate(now.getDate() - 1);
          return orderDate.getTime() === yesterday.getTime();
        case 'this_week':
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
          return orderDate >= startOfWeek;
        case 'this_month':
          return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
        default: return true;
      }
    });
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'delivered': return '#4CAF50';
      case 'shipped': return '#2196F3';
      case 'cancelled': return '#FF5252';
      default: return '#FF9800';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'delivered': return '#E8F5E9';
      case 'shipped': return '#E3F2FD';
      case 'cancelled': return '#FFEBEE';
      default: return '#FFF3E0';
    }
  };

  const calculateItemSubtotal = (item: any) => {
    return item.subtotal || (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0);
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
        <View style={styles.idContainer}>
          <Text style={styles.orderIdLabel}>Order ID</Text>
          <Text style={styles.orderIdValue}>#{item.orderId || item.id.slice(-6).toUpperCase()}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusBg(item.status) }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status || 'Ordered'}
          </Text>
        </View>
      </View>
      
      <View style={styles.orderDivider} />
      
      <View style={styles.orderBody}>
        <View style={styles.shopInfo}>
          <View style={styles.shopIconBox}>
            <Ionicons name="storefront" size={20} color="#4CAF50" />
          </View>
          <View>
            <Text style={styles.shopNameText}>{item.shopName || 'N/A'}</Text>
            <Text style={styles.orderDateText}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}</Text>
          </View>
        </View>
        <View style={styles.amountInfo}>
          <Text style={styles.amountLabel}>Total</Text>
          <Text style={styles.totalAmountText}>₹{(parseFloat(item.grandTotal) || 0).toFixed(2)}</Text>
        </View>
      </View>
      
      <View style={styles.orderFooter}>
        <View style={styles.footerInfo}>
          <Ionicons name="layers-outline" size={14} color="#999" />
          <Text style={styles.footerText}>{item.items?.length || 0} Items</Text>
          <View style={styles.dot} />
          <Ionicons name="card-outline" size={14} color="#999" />
          <Text style={styles.footerText}>{item.paymentStatus}</Text>
        </View>
        <View style={styles.viewDetailBtn}>
          <Text style={styles.viewDetailText}>View Details</Text>
          <Ionicons name="chevron-forward" size={14} color="#4CAF50" />
        </View>
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
        <TouchableOpacity style={styles.refreshButton} onPress={fetchOrders}>
          <Ionicons name="refresh" size={20} color="#4CAF50" />
        </TouchableOpacity>
      </View>

      <View style={styles.filtersWrapper}>
        <FlatList
          data={[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'this_week', label: 'This Week' },
            { id: 'this_month', label: 'This Month' },
            { id: 'all', label: 'All Orders' },
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
          <Text style={styles.loadingText}>Fetching your orders...</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBox}>
                <Ionicons name="receipt-outline" size={60} color="#CCC" />
              </View>
              <Text style={styles.emptyText}>No orders found</Text>
              <Text style={styles.emptySubtext}>Try changing the filter or create a new order.</Text>
            </View>
          }
        />
      )}

      {/* Order Detail Modal */}
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
                <Text style={styles.modalSubtitle}>ID: {selectedOrder?.orderId || selectedOrder?.id?.slice(-6).toUpperCase()}</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setIsDetailModalOpen(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Shop Section */}
              <View style={styles.detailSection}>
                <View style={styles.detailHeaderRow}>
                  <Ionicons name="storefront-outline" size={18} color="#4CAF50" />
                  <Text style={styles.sectionTitle}>Shop Information</Text>
                </View>
                <View style={styles.infoCard}>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>Shop Name</Text><Text style={styles.infoValue}>{selectedOrder?.shopName || 'N/A'}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>Date</Text><Text style={styles.infoValue}>{selectedOrder?.createdAt ? new Date(selectedOrder.createdAt).toLocaleString() : 'N/A'}</Text></View>
                </View>
              </View>

              {/* Status Section */}
              <View style={styles.detailSection}>
                <View style={styles.detailHeaderRow}>
                  <Ionicons name="stats-chart-outline" size={18} color="#4CAF50" />
                  <Text style={styles.sectionTitle}>Status</Text>
                </View>
                <View style={styles.statusGrid}>
                  <View style={styles.statusItem}><Text style={styles.statusLabel}>Order</Text><View style={[styles.smallBadge, { backgroundColor: getStatusBg(selectedOrder?.status) }]}><Text style={[styles.smallBadgeText, { color: getStatusColor(selectedOrder?.status) }]}>{selectedOrder?.status || 'Ordered'}</Text></View></View>
                  <View style={styles.statusItem}><Text style={styles.statusLabel}>Payment</Text><View style={[styles.smallBadge, { backgroundColor: '#F0F0F0' }]}><Text style={[styles.smallBadgeText, { color: '#333' }]}>{selectedOrder?.paymentStatus}</Text></View></View>
                </View>
              </View>

              {/* Items Section */}
              <View style={styles.detailSection}>
                <View style={styles.detailHeaderRow}>
                  <Ionicons name="list-outline" size={18} color="#4CAF50" />
                  <Text style={styles.sectionTitle}>Order Items</Text>
                  <Text style={styles.itemCountBadge}>{selectedOrder?.items?.length} Items</Text>
                </View>
                {selectedOrder?.items?.map((item: any, index: number) => {
                  const sub = calculateItemSubtotal(item);
                  return (
                    <View key={index} style={styles.itemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemNameText}>{item.itemName || item.name || 'Unknown Item'}</Text>
                        <View style={styles.itemMetaRow}>
                          <Text style={styles.itemMetaText}>{item.quantity} x ₹{parseFloat(item.price || 0).toFixed(2)}</Text>
                          {item.batchNumber && <View style={styles.miniBatchBadge}><Text style={styles.miniBatchText}>Batch: {item.batchNumber}</Text></View>}
                        </View>
                      </View>
                      <Text style={styles.itemSubtotalText}>₹{sub.toFixed(2)}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Financial Section */}
              <View style={styles.detailSection}>
                <View style={styles.detailHeaderRow}>
                  <Ionicons name="receipt-outline" size={18} color="#4CAF50" />
                  <Text style={styles.sectionTitle}>Payment Details</Text>
                </View>
                <View style={styles.financialCard}>
                  <View style={styles.financialRow}><Text style={styles.financialLabel}>Subtotal</Text><Text style={styles.financialValue}>₹{(parseFloat(selectedOrder?.totalSubtotal || 0) || (selectedOrder?.items?.reduce((acc: number, item: any) => acc + calculateItemSubtotal(item), 0)) || 0).toFixed(2)}</Text></View>
                  <View style={styles.financialRow}><Text style={styles.financialLabel}>Discount</Text><Text style={[styles.financialValue, { color: '#FF5252' }]}>-₹{(parseFloat(selectedOrder?.discount || 0)).toFixed(2)}</Text></View>
                  <View style={styles.financialRow}><Text style={styles.financialLabel}>Credits Used</Text><Text style={[styles.financialValue, { color: '#4CAF50' }]}>-₹{(parseFloat(selectedOrder?.creditsUsed || 0)).toFixed(2)}</Text></View>
                  <View style={styles.financialDivider} />
                  <View style={styles.financialRow}><Text style={styles.grandTotalLabel}>Grand Total</Text><Text style={styles.grandTotalValue}>₹{(parseFloat(selectedOrder?.grandTotal || 0)).toFixed(2)}</Text></View>
                  <View style={styles.financialRow}><Text style={styles.financialLabel}>Received ({selectedOrder?.paymentMethod})</Text><Text style={styles.financialValue}>₹{(parseFloat(selectedOrder?.paymentReceived || 0)).toFixed(2)}</Text></View>
                  <View style={styles.financialDivider} />
                  <View style={styles.financialRow}><Text style={styles.balanceLabel}>Balance Due</Text><Text style={[styles.balanceValue, { color: (parseFloat(selectedOrder?.balance || 0)) > 0 ? '#FF5252' : '#4CAF50' }]}>₹{(parseFloat(selectedOrder?.balance || 0)).toFixed(2)}</Text></View>
                </View>
              </View>
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
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' },
  refreshButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E8F5E9' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#333' },
  filtersWrapper: { backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  filtersContent: { paddingHorizontal: 20 },
  filterChip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 25, backgroundColor: '#F1F3F5', marginRight: 10, borderWidth: 1, borderColor: '#E9ECEF' },
  activeFilterChip: { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' },
  filterText: { fontSize: 13, color: '#666', fontWeight: '700' },
  activeFilterText: { color: '#4CAF50' },
  listContent: { padding: 20, paddingBottom: 40 },
  orderCard: { backgroundColor: '#fff', borderRadius: 25, padding: 18, marginBottom: 16, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, borderWidth: 1, borderColor: '#F1F3F5' },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  idContainer: { flexDirection: 'column' },
  orderIdLabel: { fontSize: 10, color: '#999', textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.5 },
  orderIdValue: { fontSize: 16, fontWeight: '800', color: '#333' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  orderDivider: { height: 1, backgroundColor: '#F8F9FA', marginBottom: 15 },
  orderBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  shopInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  shopIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  shopNameText: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 2 },
  orderDateText: { fontSize: 11, color: '#999' },
  amountInfo: { alignItems: 'flex-end' },
  amountLabel: { fontSize: 10, color: '#999', textTransform: 'uppercase', fontWeight: '700' },
  totalAmountText: { fontSize: 18, fontWeight: '900', color: '#333' },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8F9FA', padding: 12, borderRadius: 15 },
  footerInfo: { flexDirection: 'row', alignItems: 'center' },
  footerText: { fontSize: 11, color: '#666', fontWeight: '700', marginLeft: 4 },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#CCC', marginHorizontal: 8 },
  viewDetailBtn: { flexDirection: 'row', alignItems: 'center' },
  viewDetailText: { fontSize: 11, fontWeight: '800', color: '#4CAF50', marginRight: 2 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 15, color: '#666', fontSize: 14, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  emptyIconBox: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#F1F3F5', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyText: { fontSize: 18, color: '#333', fontWeight: '800', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#999', textAlign: 'center', paddingHorizontal: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, height: '85%', elevation: 25 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 25, borderBottomWidth: 1, borderBottomColor: '#F1F3F5' },
  modalCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F3F5', justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#333' },
  modalSubtitle: { fontSize: 12, color: '#999', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  modalBody: { padding: 25 },
  detailSection: { marginBottom: 30 },
  detailHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#333', marginLeft: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoCard: { backgroundColor: '#F8F9FA', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#E9ECEF' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  infoLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  infoValue: { fontSize: 13, fontWeight: '700', color: '#333' },
  statusGrid: { flexDirection: 'row', gap: 15 },
  statusItem: { flex: 1, backgroundColor: '#F8F9FA', padding: 15, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#E9ECEF' },
  statusLabel: { fontSize: 10, color: '#999', fontWeight: '800', textTransform: 'uppercase', marginBottom: 8 },
  smallBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  smallBadgeText: { fontSize: 11, fontWeight: '800' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F1F3F5' },
  itemNameText: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 4 },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemMetaText: { fontSize: 12, color: '#666', fontWeight: '600' },
  miniBatchBadge: { backgroundColor: '#E8F5E9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  miniBatchText: { fontSize: 10, color: '#2E7D32', fontWeight: '700' },
  itemSubtotalText: { fontSize: 16, fontWeight: '800', color: '#333' },
  itemCountBadge: { marginLeft: 'auto', fontSize: 11, fontWeight: '800', color: '#4CAF50', backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  financialCard: { backgroundColor: '#333', borderRadius: 25, padding: 20 },
  financialRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  financialLabel: { fontSize: 13, color: '#AAA', fontWeight: '600' },
  financialValue: { fontSize: 13, color: '#FFF', fontWeight: '700' },
  financialDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 12 },
  grandTotalLabel: { fontSize: 16, color: '#FFF', fontWeight: '800' },
  grandTotalValue: { fontSize: 16, color: '#4CAF50', fontWeight: '900' },
  balanceLabel: { fontSize: 18, color: '#FFF', fontWeight: '900' },
  balanceValue: { fontSize: 18, fontWeight: '900' },
});
