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
    console.error("ImageKit Error: Keys are missing in .env");
    throw new Error("ImageKit configuration error. Please contact support.");
  }

  try {
    const { token, expire, signature } = getAuthParams();
    
    const formData = new FormData();
    
    // In React Native, for files/URIs we use an object
    // For base64 (signatures), we can pass the string directly
    if (uri.startsWith('data:') || uri.startsWith('http')) {
      formData.append("file", uri);
    } else {
      formData.append("file", {
        uri: uri.startsWith('file://') ? uri : `file://${uri}`,
        name: fileName,
        type: "image/jpeg"
      } as any);
    }
    
    formData.append("fileName", fileName);
    formData.append("publicKey", PUBLIC_KEY.trim());
    formData.append("signature", signature);
    formData.append("expire", expire);
    formData.append("token", token);
    formData.append("useUniqueFileName", "true");
    formData.append("folder", "/rjr-fresh/mobile");

    console.log(`ImageKit: Attempting upload of ${fileName}...`);

    // IMPORTANT: In React Native, DON'T set Content-Type header manually for FormData
    // The fetch API will automatically set it with the correct boundary.
    const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ImageKit Upload Failed:", errorText);
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log("ImageKit Upload Success:", result.url);
    return result.url;
  } catch (error: any) {
    console.error("Mobile ImageKit Error:", error.message);
    throw error;
  }
};
