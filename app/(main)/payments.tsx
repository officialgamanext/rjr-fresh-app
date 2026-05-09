import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { db } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import * as ImagePicker from 'expo-image-picker';
import { uploadToImageKit } from '../../utils/imageUpload';


export default function PaymentsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentCheckIn, setCurrentCheckIn] = useState<any>(null);
  const [shopDetails, setShopDetails] = useState<any>(null);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    new Set(),
  );
  const [amount, setAmount] = useState("0");
  const [shopTotals, setShopTotals] = useState({ totalPaid: 0, totalDue: 0 });
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentImage, setPaymentImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);


  // 1. Fetch current check-in and shop details
  useEffect(() => {
    const fetchContext = async () => {
      if (!user?.uid) return;

      try {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

        const q = query(
          collection(db, "checkins"),
          where("userId", "==", user.uid),
          where("date", "==", today),
          where("status", "==", "Active"),
        );

        const snap = await getDocs(q);
        if (snap.empty) {
          Alert.alert(
            "No Active Check-in",
            "Please check-in to a shop first to collect payments.",
            [{ text: "OK", onPress: () => router.back() }],
          );
          return;
        }

        // Sort by timestamp descending to get the LATEST active check-in
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        docs.sort(
          (a: any, b: any) =>
            (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0),
        );

        const checkInData = docs[0];
        setCurrentCheckIn(checkInData);

        // Fetch fresh shop details
        const shopRef = doc(db, "stores", (checkInData as any).shopId);
        const shopSnap = await getDoc(shopRef);
        if (shopSnap.exists()) {
          setShopDetails({ id: shopSnap.id, ...shopSnap.data() });
        }
      } catch (err) {
        console.error("Error fetching context:", err);
        Alert.alert("Error", "Failed to load check-in details.");
      }
    };

    fetchContext();
  }, [user]);

  // 2. Real-time listener for pending orders
  useEffect(() => {
    if (!currentCheckIn?.shopId) return;

    const q = query(
      collection(db, `stores/${currentCheckIn.shopId}/sales`),
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const pending: any[] = [];
      let totalDueSum = 0;
      let totalPaidSum = 0;
      const initialIds = new Set<string>();

      snap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        
        // Robust status check
        const pStatus = (d.paymentStatus || '').toLowerCase();
        const oStatus = (d.status || '').toLowerCase();
        
        // Skip cancelled or already paid orders
        if (oStatus === 'cancelled' || pStatus === 'paid') return;

        const grandTotal = parseFloat(d.grandTotal || d.netPayable || 0);
        const paid = parseFloat(d.paidAmount || d.paymentReceived || 0);
        const due = parseFloat(d.balance !== undefined ? d.balance : (grandTotal - paid));

        totalPaidSum += paid;
        totalDueSum += due;

        // Only show if there's a significant balance due
        if (due >= 1) {
          pending.push({
            id: docSnap.id,
            ...d,
            pendingAmount: due,
            grandTotal,
            paidAmount: paid,
          });
          initialIds.add(docSnap.id);
        }
      });

      // Sort locally FIFO
      pending.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      });

      setPendingOrders(pending);
      setShopTotals({ totalPaid: totalPaidSum, totalDue: totalDueSum });
      setSelectedOrderIds(initialIds);

      const totalToPay = pending.reduce((sum, o) => sum + o.pendingAmount, 0);
      setAmount(totalToPay.toFixed(2));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentCheckIn]);

  // Handle Amount Change -> Auto-select orders
  const handleAmountChange = (val: string) => {
    let numVal = parseFloat(val) || 0;

    // Cap at total due
    if (numVal > shopTotals.totalDue) {
      numVal = shopTotals.totalDue;
    }

    const finalVal = numVal.toString();
    setAmount(finalVal);

    let remaining = numVal;
    const newSelected = new Set<string>();

    for (const order of pendingOrders) {
      if (remaining <= 0) break;
      newSelected.add(order.id);
      remaining -= order.pendingAmount;
    }
    setSelectedOrderIds(newSelected);
  };

  // Handle Checkbox Change -> Update Amount
  const toggleOrderSelection = (orderId: string) => {
    const newSelected = new Set(selectedOrderIds);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrderIds(newSelected);

    let newAmount = 0;
    pendingOrders.forEach((o) => {
      if (newSelected.has(o.id)) {
        newAmount += o.pendingAmount;
      }
    });
    setAmount(newAmount.toFixed(2));
  };

  const pickPaymentImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled) setPaymentImage(result.assets[0].uri);
  };

  const takePaymentPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera access is required.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled) setPaymentImage(result.assets[0].uri);
  };

  const handleSave = async () => {
    const pAmount = parseFloat(amount);
    if (!pAmount || pAmount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid payment amount.");
      return;
    }

    let upiImageUrl = '';
    if (paymentMethod === 'UPI') {
      if (!paymentImage) {
        Alert.alert("Proof Required", "Please upload/capture a UPI payment screenshot.");
        return;
      }
      try {
        setUploadingImage(true);
        const fileName = `upi_bulk_${currentCheckIn.shopId}_${Date.now()}.jpg`;
        upiImageUrl = await uploadToImageKit(paymentImage, fileName);
        setUploadingImage(false);
      } catch (err: any) {
        setUploadingImage(false);
        setSaving(false);
        return Alert.alert("Upload Failed", "Failed to upload UPI screenshot: " + err.message);
      }
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      let remainingPayment = pAmount;
      let distributedAmount = 0;

      const ordersToApply = pendingOrders.filter((o) =>
        selectedOrderIds.has(o.id),
      );

      for (const order of ordersToApply) {
        if (remainingPayment <= 0) break;

        const applied = Math.min(order.pendingAmount, remainingPayment);
        remainingPayment -= applied;
        distributedAmount += applied;

        const newPaidAmount = (parseFloat(order.paidAmount) || 0) + applied;
        const target = parseFloat(order.grandTotal || order.netPayable || 0);
        const newStatus = newPaidAmount >= target ? 'Paid' : 'Partial';

        const updateData = {
          paidAmount: increment(applied),
          paymentStatus: newStatus,
          updatedAt: serverTimestamp(),
        };

        // Use set with merge for global orders to handle cases where it might not exist yet (e.g. Admin Panel orders)
        batch.set(doc(db, "orders", order.id), updateData, { merge: true });
        // Keep update for store subcollection as we know it exists there
        batch.update(doc(db, `stores/${currentCheckIn.shopId}/sales`, order.id), updateData);
      }

      // Add payment record
      const payData = {
        shopId: currentCheckIn.shopId,
        shopName: currentCheckIn.shopName,
        locationId: currentCheckIn.locationId || '',
        locationName: currentCheckIn.locationName || '',
        amount: pAmount,
        distributedAmount: distributedAmount,
        unallocatedAmount: Math.max(0, remainingPayment),
        method: paymentMethod, 
        upiImage: upiImageUrl,
        status: "Awaiting Confirmation",
        type: "Bulk",
        employeeId: user?.uid,
        employeeName: currentCheckIn.employeeName || "N/A",
        employeeMobile: currentCheckIn.employeeMobile || "N/A",
        employeeUsername: user?.email?.split('@')[0] || "N/A",
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
        timestamp: serverTimestamp(),
      };

      const globalPayRef = doc(collection(db, "payments"));
      const storePayRef = doc(collection(db, `stores/${currentCheckIn.shopId}/payments`));
      batch.set(globalPayRef, payData);
      batch.set(storePayRef, payData);

      // Handle overpayment (Credits)
      if (remainingPayment > 0.01) {
        const shopRef = doc(db, "stores", currentCheckIn.shopId);
        batch.update(shopRef, {
          creditBalance: increment(remainingPayment),
        });

        const creditData = {
          shopId: currentCheckIn.shopId,
          amount: remainingPayment,
          type: "Credit",
          description: `Overpayment from ₹${pAmount} payment collected by app`,
          createdAt: serverTimestamp(),
          employeeId: user?.uid,
          employeeName: currentCheckIn.employeeName || "N/A",
          employeeUsername: user?.email?.split('@')[0] || "N/A",
        };

        const creditRef = doc(collection(db, "creditHistory"));
        const storeCreditRef = doc(collection(db, `stores/${currentCheckIn.shopId}/creditHistory`));
        batch.set(creditRef, creditData);
        batch.set(storeCreditRef, creditData);
      }

      await batch.commit();
      Alert.alert("Success", "Payment collected successfully!");
      router.back();
    } catch (err) {
      console.error("Save error:", err);
      Alert.alert("Error", "Failed to process payment.");
    } finally {
      setSaving(false);
    }
  };

  const renderOrderItem = ({ item, index }: { item: any; index: number }) => {
    const isSelected = selectedOrderIds.has(item.id);

    // Preview allocation
    let currentRemaining = parseFloat(amount) || 0;
    pendingOrders.slice(0, index).forEach((o) => {
      if (selectedOrderIds.has(o.id)) {
        currentRemaining -= o.pendingAmount;
      }
    });

    const allocation = isSelected
      ? Math.max(0, Math.min(item.pendingAmount, currentRemaining))
      : 0;
    const finalReceived = (parseFloat(item.paymentReceived) || 0) + allocation;
    const isPaid = finalReceived >= (parseFloat(item.grandTotal) || 0) - 0.01;

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.orderCard, isSelected && styles.orderCardSelected]}
        onPress={() => toggleOrderSelection(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.orderCardHeader}>
          <View style={styles.orderIdContainer}>
            <Ionicons
              name={isSelected ? "checkbox" : "square-outline"}
              size={22}
              color={isSelected ? "#4CAF50" : "#94A3B8"}
            />
            <Text style={styles.orderIdText}>
              #{item.id.slice(-6).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.orderAmountText}>
            ₹{item.pendingAmount.toFixed(2)}
          </Text>
        </View>

        <View style={styles.orderCardFooter}>
          <Text style={styles.orderDateText}>
            {new Date(item.createdAt || 0).toLocaleDateString()}
          </Text>
          <View style={styles.orderCardMeta}>
            <Text style={styles.metaLabel}>
              Total: ₹{(item.totalSubtotal || 0).toFixed(2)}
            </Text>
            <Text style={styles.metaLabel}>
              Final Amount: ₹{(item.grandTotal || 0).toFixed(2)}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: isPaid
                  ? "#DCFCE7"
                  : allocation > 0
                    ? "#FEF3C7"
                    : "#FEE2E2",
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                {
                  color: isPaid
                    ? "#166534"
                    : allocation > 0
                      ? "#92400E"
                      : "#991B1B",
                },
              ]}
            >
              {isPaid ? "Will be Paid" : allocation > 0 ? "Partial" : "Pending"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !currentCheckIn) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Collect Payment</Text>
            <Text style={styles.headerSubtitle}>
              {currentCheckIn?.shopName}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Shop Summary */}
          <View style={styles.summaryContainer}>
            <View style={[styles.summaryCard, { backgroundColor: "#F0FDF4" }]}>
              <Text style={[styles.summaryLabel, { color: "#166534" }]}>
                TOTAL
              </Text>
              <Text style={[styles.summaryValue, { color: "#14532D" }]}>
                ₹{shopTotals.totalPaid.toFixed(0)}
              </Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: "#FEF2F2" }]}>
              <Text style={[styles.summaryLabel, { color: "#991B1B" }]}>
                FINAL AMOUNT DUE
              </Text>
              <Text style={[styles.summaryValue, { color: "#7F1D1D" }]}>
                ₹{shopTotals.totalDue.toFixed(0)}
              </Text>
            </View>
          </View>

          {/* Amount Input */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Received Amount (₹)</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.currencySymbol}>₹</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                value={amount}
                onChangeText={handleAmountChange}
                placeholder="0.00"
              />
            </View>
          </View>

          {/* Payment Method */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Payment Method</Text>
            <View style={styles.methodGrid}>
              {['Cash', 'UPI'].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.methodBtn, paymentMethod === m && styles.activeMethodBtn]}
                  onPress={() => setPaymentMethod(m)}
                >
                  <Text style={[styles.methodBtnText, paymentMethod === m && styles.activeMethodBtnText]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {paymentMethod === 'UPI' && (
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>UPI Screenshot</Text>
              <View style={styles.imagePickerRow}>
                <TouchableOpacity style={styles.pickerBtn} onPress={takePaymentPhoto}>
                  <Ionicons name="camera" size={20} color="#4CAF50" />
                  <Text style={styles.pickerBtnText}>Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pickerBtn} onPress={pickPaymentImage}>
                  <Ionicons name="image" size={20} color="#4CAF50" />
                  <Text style={styles.pickerBtnText}>Upload</Text>
                </TouchableOpacity>
              </View>
              {paymentImage && (
                <View style={styles.imagePreviewRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                  <Text style={styles.imagePreviewText}>Attached</Text>
                  <TouchableOpacity onPress={() => setPaymentImage(null)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Orders List Section */}
          <View style={styles.listSection}>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>ALLOCATE TO ORDERS</Text>
              <Text style={styles.pendingCount}>
                {pendingOrders.length} Pending
              </Text>
            </View>

            {pendingOrders.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="checkmark-done-circle"
                  size={48}
                  color="#CBD5E1"
                />
                <Text style={styles.emptyText}>
                  No pending orders for this shop.
                </Text>
              </View>
            ) : (
              pendingOrders.map((item, index) =>
                renderOrderItem({ item, index }),
              )
            )}
          </View>
        </ScrollView>

        {/* Action Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.confirmButton,
              (saving || !amount || parseFloat(amount) <= 0) &&
                styles.disabledButton,
            ]}
            onPress={handleSave}
            disabled={saving || !amount || parseFloat(amount) <= 0}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.confirmButtonText}>
                  Confirm Payment ₹{parseFloat(amount || "0").toFixed(2)}
                </Text>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backButton: {
    padding: 8,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
  },
  summaryContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  inputSection: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 16,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1E293B",
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    height: 56,
    fontSize: 24,
    fontWeight: "700",
    color: "#1E293B",
  },
  listSection: {
    flex: 1,
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  listTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 1,
  },
  pendingCount: {
    fontSize: 12,
    color: "#64748B",
  },
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  orderCardSelected: {
    borderColor: "#4CAF50",
    backgroundColor: "#F0FDF4",
  },
  orderCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  orderIdContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  orderIdText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
  },
  orderAmountText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
  },
  orderCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  orderCardMeta: {
    flex: 1,
    flexDirection: "column",
    alignItems: "flex-start",
  },
  metaLabel: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "500",
  },
  orderDateText: {
    fontSize: 12,
    color: "#94A3B8",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderStyle: "dashed",
  },
  emptyText: {
    marginTop: 12,
    color: "#64748B",
    fontSize: 14,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#fff",
  },
  confirmButton: {
    backgroundColor: "#4CAF50",
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#4CAF50",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledButton: {
    backgroundColor: "#CBD5E1",
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  methodGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  methodBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activeMethodBtn: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  methodBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  activeMethodBtnText: {
    color: '#fff',
  },
  imagePickerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    gap: 8,
  },
  pickerBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  imagePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 12,
  },
  imagePreviewText: {
    flex: 1,
    fontSize: 13,
    color: '#166534',
    fontWeight: '600',
  },
  removeText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '700',
  },
});
