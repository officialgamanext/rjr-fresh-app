import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function MetricsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<any>(null);
  
  // Data State
  const [shops, setShops] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      // 1. Get Employee
      const username = user.email.split('@')[0].toLowerCase();
      const empQ = query(collection(db, 'users'), where('username', '==', username));
      const empSnap = await getDocs(empQ);
      let empId = user.uid;
      if (!empSnap.empty) {
        const empDoc = empSnap.docs[0];
        empId = empDoc.id;
        setEmployee({ ...empDoc.data(), id: empId });
      }

      // 2. Fetch Shops (Global for risk calculation)
      const shopSnap = await getDocs(collection(db, 'stores'));
      const allShops = shopSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setShops(allShops);

      // 3. Fetch Visits (All, to calculate global risks)
      const visitSnap = await getDocs(collection(db, 'checkins'));
      const allVisits = visitSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVisits(allVisits);

      // 4. Fetch Orders (All, to calculate order risks)
      const orderSnap = await getDocs(collection(db, 'orders'));
      const allOrders = orderSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(allOrders);

    } catch (error) {
      console.error("Error fetching metrics data:", error);
    } finally {
      setLoading(false);
    }
  };

  const analytics = useMemo(() => {
    const now = new Date();
    const threeDaysAgo = new Date(now); threeDaysAgo.setDate(now.getDate() - 3);
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);

    // My Visits
    const myVisits = visits.filter(v => v.employeeId === employee?.id);
    const myVisitedShopIds = new Set(myVisits.map(v => v.shopId));

    // Calculate Global Last Visit/Order for each shop
    const shopAnalysis = shops.map(shop => {
      // Last Visit globally
      const shopVisits = visits.filter(v => v.shopId === shop.id).sort((a,b) => {
        const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
        const db = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
        return db.getTime() - da.getTime();
      });
      const lastVisitDate = shopVisits.length > 0 
        ? (shopVisits[0].timestamp?.toDate ? shopVisits[0].timestamp.toDate() : new Date(shopVisits[0].timestamp))
        : null;

      // Last Order globally
      const shopOrders = orders.filter(o => o.shopId === shop.id).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const lastOrderDate = shopOrders.length > 0 ? new Date(shopOrders[0].createdAt) : null;

      return {
        ...shop,
        lastVisitDate,
        lastOrderDate,
        daysSinceVisit: lastVisitDate ? Math.floor((now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24)) : Infinity,
        daysSinceOrder: lastOrderDate ? Math.floor((now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24)) : Infinity
      };
    });

    const notVisited3 = shopAnalysis.filter(s => s.daysSinceVisit >= 3);
    const notVisited7 = shopAnalysis.filter(s => s.daysSinceVisit >= 7);
    const noOrders3 = shopAnalysis.filter(s => s.daysSinceOrder >= 3);

    return {
      myVisitedCount: myVisitedShopIds.size,
      notVisited3: notVisited3.length,
      notVisited7: notVisited7.length,
      noOrders3: noOrders3.length,
      notVisited3List: notVisited3.slice(0, 5),
      noOrders3List: noOrders3.slice(0, 5)
    };
  }, [shops, visits, orders, employee]);

  if (loading) {
    return (
      <View style={styles.centerContent}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Calculating Metrics...</Text>
      </View>
    );
  }

  const MetricCard = ({ title, value, sub, icon, colors, risk }: any) => (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.metricCard}>
      <View style={styles.cardTop}>
        <View style={styles.iconBox}><Ionicons name={icon} size={24} color="#fff" /></View>
        {risk && <View style={styles.riskBadge}><Text style={styles.riskText}>Risk</Text></View>}
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricTitle}>{title}</Text>
      <Text style={styles.metricSub}>{sub}</Text>
    </LinearGradient>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics Dashboard</Text>
        <TouchableOpacity onPress={fetchData}><Ionicons name="refresh" size={20} color="#4CAF50" /></TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryGrid}>
          <MetricCard 
            title="My Shop Visits"
            value={analytics.myVisitedCount}
            sub="Unique shops you visited"
            icon="people"
            colors={['#4CAF50', '#2E7D32']}
          />
          <MetricCard 
            title="Not Visited (3d)"
            value={analytics.notVisited3}
            sub="Inactive in last 3 days"
            icon="alert-circle"
            colors={['#FF9800', '#F57C00']}
            risk
          />
        </View>

        <View style={styles.summaryGrid}>
          <MetricCard 
            title="Not Visited (7d)"
            value={analytics.notVisited7}
            sub="Critical: No visit > 1 week"
            icon="warning"
            colors={['#F44336', '#D32F2F']}
            risk
          />
          <MetricCard 
            title="No Orders (3d)"
            value={analytics.noOrders3}
            sub="Sales drop-off risk"
            icon="cart"
            colors={['#9C27B0', '#7B1FA2']}
            risk
          />
        </View>

        {/* Risk Lists */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Shops at Risk (No Orders 3d+)</Text>
          <Ionicons name="trending-down" size={20} color="#F44336" />
        </View>
        <View style={styles.listCard}>
          {analytics.noOrders3List.map((shop, i) => (
            <View key={shop.id} style={[styles.listItem, i === analytics.noOrders3List.length - 1 && { borderBottomWidth: 0 }]}>
              <View>
                <Text style={styles.listShopName}>{shop.name}</Text>
                <Text style={styles.listLastDate}>Last Order: {shop.lastOrderDate ? shop.lastOrderDate.toLocaleDateString() : 'Never'}</Text>
              </View>
              <View style={styles.daysBadge}>
                <Text style={styles.daysText}>{shop.daysSinceOrder === Infinity ? '∞' : shop.daysSinceOrder}d</Text>
              </View>
            </View>
          ))}
          {analytics.noOrders3List.length === 0 && <Text style={styles.emptyListText}>All shops are active! Great job.</Text>}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Overdue Visits (3d+)</Text>
          <Ionicons name="time" size={20} color="#FF9800" />
        </View>
        <View style={styles.listCard}>
          {analytics.notVisited3List.map((shop, i) => (
            <View key={shop.id} style={[styles.listItem, i === analytics.notVisited3List.length - 1 && { borderBottomWidth: 0 }]}>
              <View>
                <Text style={styles.listShopName}>{shop.name}</Text>
                <Text style={styles.listLastDate}>Last Visit: {shop.lastVisitDate ? shop.lastVisitDate.toLocaleDateString() : 'Never'}</Text>
              </View>
              <View style={[styles.daysBadge, { backgroundColor: '#FFF3E0' }]}>
                <Text style={[styles.daysText, { color: '#FF9800' }]}>{shop.daysSinceVisit === Infinity ? '∞' : shop.daysSinceVisit}d</Text>
              </View>
            </View>
          ))}
          {analytics.notVisited3List.length === 0 && <Text style={styles.emptyListText}>No overdue visits.</Text>}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#333' },
  content: { flex: 1, padding: 20 },
  summaryGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  metricCard: { width: (width - 55) / 2, borderRadius: 20, padding: 15, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  riskBadge: { backgroundColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  riskText: { fontSize: 10, color: '#fff', fontWeight: '800', textTransform: 'uppercase' },
  metricValue: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 2 },
  metricTitle: { fontSize: 14, fontWeight: '800', color: '#fff', opacity: 0.9 },
  metricSub: { fontSize: 10, color: '#fff', opacity: 0.7, marginTop: 4 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 15, fontSize: 14, color: '#666', fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 25, marginBottom: 15, paddingHorizontal: 5 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#333', marginRight: 8 },
  listCard: { backgroundColor: '#fff', borderRadius: 20, padding: 15, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  listShopName: { fontSize: 14, fontWeight: '700', color: '#333' },
  listLastDate: { fontSize: 11, color: '#999', marginTop: 2 },
  daysBadge: { backgroundColor: '#FFEBEE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  daysText: { fontSize: 12, fontWeight: '800', color: '#F44336' },
  emptyListText: { textAlign: 'center', color: '#999', paddingVertical: 20, fontSize: 14 }
});
