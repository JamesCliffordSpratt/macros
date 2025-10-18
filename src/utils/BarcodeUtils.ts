// Define proper types for ZXing library components
interface ZXingLibrary {
  BrowserMultiFormatReader?: new () => ZXingCodeReader;
  MultiFormatReader?: new () => ZXingCodeReader;
  BrowserCodeReader?: new () => ZXingCodeReader;
  HTMLCanvasElementLuminanceSource?: new (canvas: HTMLCanvasElement) => unknown;
  BinaryBitmap?: new (binarizer: unknown) => unknown;
  HybridBinarizer?: new (source: unknown) => unknown;
  default?: ZXingLibrary;
}

interface ZXingCodeReader {
  decode?(target: HTMLCanvasElement | ImageData | unknown): Promise<ZXingResult>;
  decodeFromCanvas?(canvas: HTMLCanvasElement): Promise<ZXingResult>;
  decodeFromImageData?(imageData: ImageData): Promise<ZXingResult>;
  decodeFromImageElement?(img: HTMLImageElement): Promise<ZXingResult>;
  decodeFromImage?(img: HTMLImageElement): Promise<ZXingResult>;
  setHints?(hints: Map<string, unknown>): void;
}

interface ZXingResult {
  getText(): string;
  getBarcodeFormat(): { toString(): string };
}

// Extend Window interface for ZXing globals
declare global {
  interface Window {
    ZXing?: ZXingLibrary;
    ZXingLibrary?: ZXingLibrary;
    ZXingBrowser?: ZXingLibrary;
  }
}

export class ZXingLoader {
  private static instance: ZXingLibrary | null = null;
  private static loading: Promise<ZXingLibrary> | null = null;

  static async loadZXing(): Promise<ZXingLibrary> {
    if (this.instance) {
      return this.instance;
    }

    if (this.loading) {
      return this.loading;
    }

    this.loading = this.tryLoadZXing();

    try {
      this.instance = await this.loading;
      return this.instance;
    } finally {
      this.loading = null;
    }
  }

  private static async tryLoadZXing(): Promise<ZXingLibrary> {
    const loadMethods = [
      // Method 1: Try browser-specific import first
      async (): Promise<ZXingLibrary> => {
        const ZXing = await import('@zxing/browser');
        return ZXing as unknown as ZXingLibrary;
      },

      // Method 2: Try ES module import
      async (): Promise<ZXingLibrary> => {
        const ZXing = await import('@zxing/library');
        return ZXing as unknown as ZXingLibrary;
      },

      // Method 3: Try browser-specific CDN with full browser support
      async (): Promise<ZXingLibrary> => {
        return new Promise((resolve, reject) => {
          // Remove any existing script first
          const existingScript = document.querySelector('script[src*="zxing"]');
          if (existingScript) {
            existingScript.remove();
          }

          const script = document.createElement('script');
          script.src = 'https://unpkg.com/@zxing/browser@0.1.1/lib/index.min.js';
          script.onload = () => {
            // Check multiple possible global names
            const ZXing = window.ZXingBrowser || window.ZXing || window.ZXingLibrary;
            if (ZXing) {
              resolve(ZXing);
            } else {
              reject(new Error('ZXing browser not found on window after CDN load'));
            }
          };
          script.onerror = (_error) => {
            reject(new Error('Failed to load ZXing browser from CDN'));
          };
          document.head.appendChild(script);
        });
      },

      // Method 4: Try CDN import with specific version
      async (): Promise<ZXingLibrary> => {
        return new Promise((resolve, reject) => {
          // Remove any existing script first
          const existingScript = document.querySelector('script[src*="zxing"]');
          if (existingScript) {
            existingScript.remove();
          }

          const script = document.createElement('script');
          script.src = 'https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js';
          script.onload = () => {
            // Check multiple possible global names
            const ZXing = window.ZXing || window.ZXingLibrary || window.ZXingBrowser;
            if (ZXing) {
              resolve(ZXing);
            } else {
              reject(new Error('ZXing not found on window after CDN load'));
            }
          };
          script.onerror = (_error) => {
            reject(new Error('Failed to load ZXing from CDN'));
          };
          document.head.appendChild(script);
        });
      },

      // Method 5: Try alternative CDN
      async (): Promise<ZXingLibrary> => {
        return new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js';
          script.onload = () => {
            const ZXing = window.ZXing || window.ZXingLibrary;
            if (ZXing) {
              resolve(ZXing);
            } else {
              reject(new Error('ZXing not found after jsdelivr load'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load ZXing from jsdelivr'));
          document.head.appendChild(script);
        });
      },
    ];

    let lastError: Error | null = null;

    for (const loadMethod of loadMethods) {
      try {
        const ZXing = await loadMethod();
        return ZXing;
      } catch (error) {
        lastError = error as Error;
      }
    }

    throw new Error(`Failed to load ZXing library. Last error: ${lastError?.message}`);
  }

  static async createCodeReader(): Promise<ZXingCodeReader> {
    const ZXing = await this.loadZXing();

    // Try different reader constructors with proper TypeScript syntax
    const readerConstructors = [
      (): ZXingCodeReader | null => {
        if (ZXing.BrowserMultiFormatReader) {
          return new ZXing.BrowserMultiFormatReader();
        }
        return null;
      },
      (): ZXingCodeReader | null => {
        if (ZXing.default && ZXing.default.BrowserMultiFormatReader) {
          return new ZXing.default.BrowserMultiFormatReader();
        }
        return null;
      },
      (): ZXingCodeReader | null => {
        // Try browser-specific reader from different import path
        if (ZXing.BrowserCodeReader) {
          return new ZXing.BrowserCodeReader();
        }
        return null;
      },
      (): ZXingCodeReader | null => {
        if (ZXing.MultiFormatReader) {
          const reader = new ZXing.MultiFormatReader();
          // Wrap it with browser-specific methods if needed
          return this.wrapReaderWithBrowserMethods(reader, ZXing);
        }
        return null;
      },
      (): ZXingCodeReader | null => {
        if (ZXing.default && ZXing.default.MultiFormatReader) {
          const reader = new ZXing.default.MultiFormatReader();
          return this.wrapReaderWithBrowserMethods(reader, ZXing.default || ZXing);
        }
        return null;
      },
    ];

    for (const constructor of readerConstructors) {
      try {
        const reader = constructor();
        if (reader) {
          return reader;
        }
      } catch (error) {
        // Continue to next constructor
      }
    }

    throw new Error('Could not create any code reader from ZXing library');
  }

  private static wrapReaderWithBrowserMethods(
    reader: ZXingCodeReader,
    ZXing: ZXingLibrary
  ): ZXingCodeReader {
    // If we get a basic MultiFormatReader, add browser-specific decode methods
    if (!reader.decodeFromCanvas && !reader.decodeFromImageData) {
      // Add decodeFromCanvas method
      reader.decodeFromCanvas = async function (canvas: HTMLCanvasElement): Promise<ZXingResult> {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot get canvas context');

        const _imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        if (
          !ZXing.HTMLCanvasElementLuminanceSource ||
          !ZXing.BinaryBitmap ||
          !ZXing.HybridBinarizer
        ) {
          throw new Error('Required ZXing components not available');
        }

        const luminanceSource = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
        const binaryBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminanceSource));

        if (!reader.decode) {
          throw new Error('Decode method not available on reader');
        }

        return reader.decode(binaryBitmap) as Promise<ZXingResult>;
      };

      // Add decodeFromImageData method
      reader.decodeFromImageData = async function (imageData: ImageData): Promise<ZXingResult> {
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot create canvas context');

        ctx.putImageData(imageData, 0, 0);

        if (!reader.decodeFromCanvas) {
          throw new Error('decodeFromCanvas method not available');
        }

        return reader.decodeFromCanvas(canvas);
      };

      // Add decodeFromImageElement method
      reader.decodeFromImageElement = async function (img: HTMLImageElement): Promise<ZXingResult> {
        const canvas = document.createElement('canvas');
        canvas.width = img.width || img.naturalWidth;
        canvas.height = img.height || img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot create canvas context');

        ctx.drawImage(img, 0, 0);

        if (!reader.decodeFromCanvas) {
          throw new Error('decodeFromCanvas method not available');
        }

        return reader.decodeFromCanvas(canvas);
      };
    }

    return reader;
  }
}

export class BarcodeUtils {
  static validateBarcode(barcode: string): {
    isValid: boolean;
    format?: string;
    checksumValid?: boolean;
    normalizedCode?: string;
  } {
    const cleaned = barcode.replace(/[\s-]/g, '');

    if (!/^\d+$/.test(cleaned)) {
      return { isValid: false };
    }

    if (cleaned.length === 13) {
      return {
        isValid: true,
        format: 'EAN-13',
        checksumValid: this.validateEan13Checksum(cleaned),
        normalizedCode: cleaned,
      };
    } else if (cleaned.length === 12) {
      return {
        isValid: true,
        format: 'UPC-A',
        checksumValid: this.validateUpcAChecksum(cleaned),
        normalizedCode: cleaned,
      };
    } else if (cleaned.length === 8) {
      return {
        isValid: true,
        format: 'EAN-8',
        checksumValid: this.validateEan8Checksum(cleaned),
        normalizedCode: cleaned,
      };
    } else if (cleaned.length >= 6 && cleaned.length <= 18) {
      return {
        isValid: true,
        format: 'Code-128',
        checksumValid: true,
        normalizedCode: cleaned,
      };
    }

    return { isValid: false };
  }

  private static validateEan13Checksum(ean: string): boolean {
    if (ean.length !== 13) return false;

    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(ean[i]);
      sum += i % 2 === 0 ? digit : digit * 3;
    }

    const checksum = (10 - (sum % 10)) % 10;
    return checksum === parseInt(ean[12]);
  }

  private static validateUpcAChecksum(upc: string): boolean {
    if (upc.length !== 12) return false;

    let sum = 0;
    for (let i = 0; i < 11; i++) {
      const digit = parseInt(upc[i]);
      sum += i % 2 === 0 ? digit * 3 : digit;
    }

    const checksum = (10 - (sum % 10)) % 10;
    return checksum === parseInt(upc[11]);
  }

  private static validateEan8Checksum(ean: string): boolean {
    if (ean.length !== 8) return false;

    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const digit = parseInt(ean[i]);
      sum += i % 2 === 0 ? digit * 3 : digit;
    }

    const checksum = (10 - (sum % 10)) % 10;
    return checksum === parseInt(ean[7]);
  }

  static formatBarcodeForDisplay(barcode: string): string {
    const validation = this.validateBarcode(barcode);

    if (!validation.isValid || !validation.normalizedCode) {
      return barcode;
    }

    const code = validation.normalizedCode;

    switch (validation.format) {
      case 'EAN-13':
        return `${code.slice(0, 1)} ${code.slice(1, 7)} ${code.slice(7)}`;
      case 'UPC-A':
        return `${code.slice(0, 6)} ${code.slice(6)}`;
      case 'EAN-8':
        return `${code.slice(0, 4)} ${code.slice(4)}`;
      default:
        return code;
    }
  }
}

export class CameraDiagnostics {
  static async checkCameraAvailability(): Promise<{
    hasCamera: boolean;
    cameras: MediaDeviceInfo[];
    error?: string;
  }> {
    try {
      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return {
          hasCamera: false,
          cameras: [],
          error: 'Media devices API not supported in this environment',
        };
      }

      // Get list of available devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === 'videoinput');

      return {
        hasCamera: cameras.length > 0,
        cameras: cameras,
        error: cameras.length === 0 ? 'No cameras detected on this device' : undefined,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        hasCamera: false,
        cameras: [],
        error: `Failed to check camera availability: ${errorMessage}`,
      };
    }
  }

  static async testBasicCameraAccess(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Try the most basic camera request
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      // Immediately stop the stream since this is just a test
      stream.getTracks().forEach((track) => track.stop());

      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

export class MobilePermissionHandler {
  static async requestCameraPermission(): Promise<{
    granted: boolean;
    stream?: MediaStream;
    error?: string;
  }> {
    try {
      const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      const isDesktop = !isMobile;

      // Check if we're in Obsidian desktop environment
      const isObsidianDesktop =
        !!(window as Window & { require?: unknown }).require ||
        navigator.userAgent.includes('Electron');

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: isMobile ? 'environment' : 'user', // Use front camera on desktop
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
        },
      };

      // For desktop/Obsidian, try simpler constraints first
      if (isDesktop || isObsidianDesktop) {
        // Try basic video constraints first
        try {
          const basicConstraints = { video: true };
          const stream = await navigator.mediaDevices.getUserMedia(basicConstraints);
          return { granted: true, stream };
        } catch (basicError: unknown) {
          // Try with even more basic constraints
          try {
            const minimalConstraints = {
              video: {
                width: { ideal: 320 },
                height: { ideal: 240 },
              },
            };
            const stream = await navigator.mediaDevices.getUserMedia(minimalConstraints);
            return { granted: true, stream };
          } catch (_minimalError: unknown) {
            // Fall through to error handling
            throw basicError; // Use the original error for better debugging
          }
        }
      }

      // Check permissions API if available (mainly for browsers)
      if (navigator.permissions && !isObsidianDesktop) {
        try {
          const permission = await navigator.permissions.query({
            name: 'camera' as PermissionName,
          });

          if (permission.state === 'denied') {
            return {
              granted: false,
              error:
                'Camera permission was previously denied. Please reset permissions or enable camera access in your browser/system settings.',
            };
          }
        } catch (_permError) {
          // Permission query not supported or failed - continue anyway
        }
      }

      // Try to get camera stream with full constraints
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      return {
        granted: true,
        stream,
      };
    } catch (error: unknown) {
      let errorMessage = '';
      const err = error as { name?: string; message?: string };

      switch (err.name) {
        case 'NotAllowedError':
          errorMessage = this.getDesktopPermissionError();
          break;
        case 'NotFoundError':
          errorMessage =
            'No camera found on this device. Please ensure a camera is connected and functioning.';
          break;
        case 'NotReadableError':
          errorMessage =
            'Camera is already in use by another application. Please close other apps using the camera and try again.';
          break;
        case 'OverconstrainedError':
          errorMessage =
            'Camera constraints could not be satisfied. Try using a different camera or check camera settings.';
          break;
        case 'SecurityError':
          errorMessage =
            "Camera access blocked due to security restrictions. This may be due to Obsidian's security settings.";
          break;
        case 'AbortError':
          errorMessage = 'Camera access was aborted.';
          break;
        default:
          errorMessage = `Camera access failed: ${err.message || 'Unknown error'}. This might be due to Obsidian's security restrictions.`;
      }

      return {
        granted: false,
        error: errorMessage,
      };
    }
  }

  private static getDesktopPermissionError(): string {
    const isObsidianDesktop =
      !!(window as Window & { require?: unknown }).require ||
      navigator.userAgent.includes('Electron');

    if (isObsidianDesktop) {
      return `Camera permission denied in Obsidian. Possible solutions:

1. Check Windows camera privacy settings:
   - Go to Windows Settings > Privacy & Security > Camera
   - Ensure "Camera access" is turned on
   - Ensure "Let apps access your camera" is turned on
   
2. Restart Obsidian completely and try again

3. Try the "Upload Image" option instead

4. Check if other apps (like Camera app) can access your camera

5. If using antivirus software, check if it's blocking camera access`;
    } else {
      return `Camera permission denied. Please:
1. Check browser camera permissions
2. Ensure you're using HTTPS
3. Check system camera privacy settings`;
    }
  }

  static shouldShowPermissionInstructions(): boolean {
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    const isObsidianDesktop =
      !!(window as Window & { require?: unknown }).require ||
      navigator.userAgent.includes('Electron');

    return isMobile || isObsidianDesktop;
  }

  static getPermissionInstructions(): string {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isObsidianDesktop =
      !!(window as Window & { require?: unknown }).require ||
      navigator.userAgent.includes('Electron');

    if (isObsidianDesktop) {
      return `📱 Desktop: Check Windows camera settings (Settings > Privacy & Security > Camera) and ensure camera access is enabled for apps.`;
    } else if (isIOS) {
      return 'On iOS: Tap the "AA" icon in Safari address bar → Website Settings → Camera → Allow';
    } else if (isAndroid) {
      return 'On Android: Tap the camera icon in the address bar or go to browser Settings → Site permissions → Camera';
    } else {
      return 'Please allow camera access when prompted by your browser.';
    }
  }
}
