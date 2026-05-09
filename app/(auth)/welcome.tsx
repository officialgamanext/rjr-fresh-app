import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, SafeAreaView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { 
  FadeInDown, 
  FadeInUp, 
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

// Colors from design
const COLORS = {
  primary: '#1B3C1A', // Dark Forest Green
  accent: '#DC2626',  // Red for RJR
  text: '#4B5563',    // Gray for description
  heading: '#111827', // Darker gray for heading
  white: '#FFFFFF',
  gray: '#9CA3AF',
  lightGray: '#F3F4F6',
};

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const floatingAnim = useSharedValue(0);

  useEffect(() => {
    floatingAnim.value = withRepeat(
      withSequence(
        withTiming(-15, { duration: 2500 }),
        withTiming(0, { duration: 2500 })
      ),
      -1,
      true
    );
  }, []);

  const animatedIllustrationStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatingAnim.value }],
  }));

  const handleGetStarted = () => {
    router.push('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Background Shapes - Subtle wavy design at bottom */}
      <View style={styles.backgroundAccent} />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          
          {/* Logo Section */}
          <Animated.View 
            entering={FadeInUp.delay(200).duration(800)}
            style={[styles.logoSection, { marginTop: insets.top > 0 ? 10 : 30 }]}
          >
            <Image 
              source={require('../../assets/images/rjr_logo.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>Delivering Freshness, Building Trust</Text>
          </Animated.View>

          {/* Illustration Section */}
          <Animated.View 
            entering={FadeIn.delay(400).duration(1000)}
            style={styles.illustrationContainer}
          >
            <Animated.View style={animatedIllustrationStyle}>
              <Image 
                source={require('../../assets/images/welcome_illustration.png')} 
                style={styles.illustration}
                resizeMode="contain"
              />
            </Animated.View>
          </Animated.View>

          {/* Text Section */}
          <View style={styles.textSection}>
            <Animated.Text 
              entering={FadeInDown.delay(600).duration(800)}
              style={styles.welcomeTitle}
            >
              Welcome to{'\n'}
              <Text style={{ color: COLORS.accent }}>RJR</Text>{' '}
              <Text style={{ color: COLORS.primary }}>FRESH</Text> Agent App
            </Animated.Text>
            
            <Animated.Text 
              entering={FadeInDown.delay(800).duration(800)}
              style={styles.subtitle}
            >
              Manage orders, track deliveries, collect payments, and grow with RJR Fresh.
            </Animated.Text>

            {/* Pagination Dots */}
            <Animated.View 
              entering={FadeIn.delay(1000).duration(800)}
              style={styles.pagination}
            >
              <View style={[styles.dot, styles.activeDot]} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </Animated.View>
          </View>

          {/* Footer Section */}
          <Animated.View 
            entering={FadeInDown.delay(1200).duration(800)}
            style={styles.footer}
          >
            <TouchableOpacity
              style={styles.button}
              onPress={handleGetStarted}
              activeOpacity={0.9}
            >
              <Text style={styles.buttonText}>Get Started</Text>
              <Feather name="arrow-right" size={24} color={COLORS.white} />
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => router.push('/(auth)/login')}
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>I already have an account</Text>
            </TouchableOpacity>
          </Animated.View>

        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  safeArea: {
    flex: 1,
  },
  backgroundAccent: {
    position: 'absolute',
    bottom: -80,
    left: -100,
    right: -100,
    height: 350,
    backgroundColor: '#EEF2FF', // Very light indigo/blue tint
    borderRadius: 300,
    opacity: 0.6,
    transform: [{ scaleX: 1.5 }],
  },
  content: {
    flex: 1,
    paddingHorizontal: 25,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoSection: {
    alignItems: 'center',
    width: '100%',
  },
  logo: {
    width: width * 0.6,
    height: 70,
  },
  tagline: {
    fontSize: 14,
    color: COLORS.text,
    marginTop: 4,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  illustrationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  illustration: {
    width: width * 0.9,
    height: width * 0.9,
  },
  textSection: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
  },
  welcomeTitle: {
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    color: COLORS.heading,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.text,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 24,
    paddingHorizontal: 15,
  },
  pagination: {
    flexDirection: 'row',
    marginTop: 25,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  activeDot: {
    backgroundColor: COLORS.primary,
    width: 28,
  },
  footer: {
    width: '100%',
    paddingBottom: 25,
    alignItems: 'center',
  },
  button: {
    backgroundColor: COLORS.primary,
    width: '100%',
    height: 64,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    elevation: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },
  linkButton: {
    marginTop: 20,
    paddingVertical: 10,
  },
  linkText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});


