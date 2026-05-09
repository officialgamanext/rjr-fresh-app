import CryptoJS from 'crypto-js';

const PUBLIC_KEY = process.env.EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EXPO_PUBLIC_IMAGEKIT_PRIVATE_KEY;

/**
 * Generate ImageKit signature for mobile
 */
const getAuthParams = () => {
  const token = Math.random().toString(36).substring(2) + Date.now();
  const expire = (Math.floor(Date.now() / 1000) + 2400).toString();
  
  // ImageKit signature = HMAC-SHA1(token + expire, private_key)
  const signature = CryptoJS.HmacSHA1(token + expire, PRIVATE_KEY || "").toString(CryptoJS.enc.Hex);
  
  return { token, expire, signature };
};

/**
 * Upload Image to ImageKit from Mobile
 * @param uri Local file URI (from image picker or signature pad)
 * @param fileName Name of the file
 */
export const uploadToImageKit = async (uri: string, fileName: string): Promise<string> => {
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    throw new Error("ImageKit keys missing in mobile .env");
  }

  try {
    const { token, expire, signature } = getAuthParams();
    
    const formData = new FormData();
    // In React Native, the 'file' field must be an object with uri, type, and name
    formData.append("file", {
      uri: uri,
      name: fileName,
      type: "image/jpeg"
    } as any);
    
    formData.append("fileName", fileName);
    formData.append("publicKey", PUBLIC_KEY.trim());
    formData.append("signature", signature);
    formData.append("expire", expire);
    formData.append("token", token);
    formData.append("useUniqueFileName", "true");
    formData.append("folder", "/rjr-fresh/mobile");

    const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Upload failed");
    }

    const result = await response.json();
    return result.url;
  } catch (error: any) {
    console.error("Mobile ImageKit Error:", error.message);
    throw error;
  }
};
