import React, { useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { Feather } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  onSave: (base64: string) => void;
  onClose: () => void;
}

const SignatureModal = ({ visible, onSave, onClose }: Props) => {
  const ref = useRef<SignatureViewRef>(null);

  const handleOK = (signature: string) => {
    // signature is base64
    onSave(signature);
  };

  const handleClear = () => {
    ref.current?.clearCanvas();
  };

  const handleConfirm = () => {
    ref.current?.readSignature();
  };

  const style = `.m-signature-pad--footer {display: none; margin: 0px;}`;

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Customer Signature</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={styles.canvasContainer}>
            <SignatureScreen
              ref={ref}
              onOK={handleOK}
              descriptionText="Sign Here"
              clearText="Clear"
              confirmText="Save"
              webStyle={style}
              autoClear={true}
            />
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
              <Feather name="rotate-ccw" size={18} color="#64748b" />
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.saveBtn} onPress={handleConfirm}>
              <Feather name="check" size={18} color="#fff" />
              <Text style={styles.saveText}>Use Signature</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    height: 450,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  clearText: {
    fontWeight: '600',
    color: '#64748b',
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  saveText: {
    fontWeight: '700',
    color: '#fff',
  },
});

export default SignatureModal;
