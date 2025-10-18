import { Component, Modal, App, Notice } from 'obsidian';
import MacrosPlugin from '../main';
import {
  ZXingLoader,
  BarcodeUtils,
  MobilePermissionHandler,
  CameraDiagnostics,
} from './BarcodeUtils';

export interface BarcodeResult {
  code: string;
  format: string;
  confidence?: number;
}

// Enhanced ZXing interfaces to include BarcodeFormat
interface ZXingBarcodeFormat {
  EAN_13: unknown;
  EAN_8: unknown;
  UPC_A: unknown;
  UPC_E: unknown;
  CODE_128: unknown;
  CODE_39: unknown;
  CODE_93: unknown;
  ITF: unknown;
  CODABAR: unknown;
}

interface EnhancedZXingLibrary {
  BarcodeFormat?: ZXingBarcodeFormat;
  default?: EnhancedZXingLibrary;
}

interface ZXingCodeReader {
  decode?(target: HTMLCanvasElement | ImageData | unknown): Promise<ZXingResult>;
  decodeFromCanvas?(canvas: HTMLCanvasElement): Promise<ZXingResult>;
  decodeFromImageData?(imageData: ImageData): Promise<ZXingResult>;
  decodeFromImageElement?(img: HTMLImageElement): Promise<ZXingResult>;
  decodeFromImage?(img: HTMLImageElement): Promise<ZXingResult>;
  decodeFromVideoDevice?(
    deviceId: string | undefined,
    videoElement: HTMLVideoElement
  ): Promise<ZXingResult>;
  decodeBitmap?(imageData: ImageData): Promise<ZXingResult>;
  setHints?(hints: Map<string, unknown>): void;
}

interface ZXingResult {
  getText(): string;
  getBarcodeFormat(): { toString(): string };
  text?: string;
  code?: string;
  format?: string;
}

export class BarcodeScanner extends Component {
  public video: HTMLVideoElement | null = null;
  public canvas: HTMLCanvasElement | null = null;
  public context: CanvasRenderingContext2D | null = null;
  public codeReader: ZXingCodeReader | null = null;
  private stream: MediaStream | null = null;
  private scanning = false;
  private scanInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private app: App,
    private plugin: MacrosPlugin,
    private onBarcodeDetected: (result: BarcodeResult) => void,
    private onError: (error: string) => void
  ) {
    super();
  }

  async initializeCamera(): Promise<boolean> {
    try {
      this.plugin.logger.debug('Requesting camera permission...');

      const permissionResult = await MobilePermissionHandler.requestCameraPermission();

      if (!permissionResult.granted) {
        const instructions = MobilePermissionHandler.getPermissionInstructions();
        const errorMsg = `${permissionResult.error}\n\n${instructions}`;
        this.onError(errorMsg);
        return false;
      }

      if (!permissionResult.stream) {
        this.onError('Camera stream not available');
        return false;
      }

      this.stream = permissionResult.stream;
      this.plugin.logger.debug('Camera permission granted successfully');
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.plugin.logger.error('Camera initialization failed:', error);
      this.onError(`Unexpected camera error: ${errorMessage}`);
      return false;
    }
  }

  async startScanning(videoElement: HTMLVideoElement): Promise<void> {
    if (!this.stream) {
      throw new Error('Camera not initialized');
    }

    this.video = videoElement;
    this.video.srcObject = this.stream;

    await new Promise<void>((resolve, reject) => {
      if (!this.video) {
        reject(new Error('Video element not available'));
        return;
      }

      this.video.addEventListener('loadedmetadata', () => resolve());
      this.video.addEventListener('error', reject);
      this.video.play().catch(reject);
    });

    await this.initializeDecoder();
    this.scanning = true;
    this.startScanLoop();
  }

  private async initializeDecoder(): Promise<void> {
    try {
      this.plugin.logger.debug('Initializing ZXing decoder...');
      this.codeReader = await ZXingLoader.createCodeReader();

      // Configure the reader for better barcode detection
      if (this.codeReader.setHints) {
        const ZXing = (await ZXingLoader.loadZXing()) as EnhancedZXingLibrary;
        const hints = new Map<string, unknown>();

        // Try to enable all barcode formats
        const BarcodeFormat = ZXing.BarcodeFormat || (ZXing.default && ZXing.default.BarcodeFormat);

        if (BarcodeFormat) {
          hints.set('POSSIBLE_FORMATS', [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.CODE_93,
            BarcodeFormat.ITF,
            BarcodeFormat.CODABAR,
          ]);
        }

        hints.set('TRY_HARDER', true);
        hints.set('ALSO_INVERTED', true);

        this.codeReader.setHints(hints);
      }

      this.plugin.logger.debug('ZXing decoder initialized successfully');
    } catch (error) {
      this.plugin.logger.error('Failed to load ZXing library:', error);
      throw new Error(
        'Barcode decoder library failed to load. Please check your internet connection and try again.'
      );
    }
  }

  private startScanLoop(): void {
    if (!this.video || !this.codeReader) return;

    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    this.plugin.logger.debug('Starting barcode scan loop');
    let scanAttempts = 0;

    this.scanInterval = setInterval(async () => {
      if (!this.scanning || !this.video || !this.canvas || !this.context) {
        return;
      }

      scanAttempts++;
      if (scanAttempts % 10 === 0) {
        this.plugin.logger.debug('Scan attempt', {
          attempt: scanAttempts,
          videoWidth: this.video.videoWidth,
          videoHeight: this.video.videoHeight,
        });
      }

      try {
        // Check if video is ready
        if (this.video.videoWidth === 0 || this.video.videoHeight === 0) {
          if (scanAttempts % 20 === 0) {
            this.plugin.logger.debug('Video not ready yet, waiting...');
          }
          return;
        }

        // Ensure canvas has proper dimensions
        const width = this.video.videoWidth;
        const height = this.video.videoHeight;

        if (width === 0 || height === 0) {
          if (scanAttempts % 20 === 0) {
            this.plugin.logger.debug('Invalid video dimensions, skipping...');
          }
          return;
        }

        this.canvas.width = width;
        this.canvas.height = height;
        this.context.drawImage(this.video, 0, 0, width, height);

        // Try different ZXing API methods
        let result: ZXingResult | null = null;

        try {
          // Method 1: Try decodeFromCanvas (most common for browsers)
          if (this.codeReader && this.codeReader.decodeFromCanvas) {
            result = await this.codeReader.decodeFromCanvas(this.canvas);
          }
          // Method 2: Try decode with canvas (alternative syntax)
          else if (this.codeReader && this.codeReader.decode) {
            result = await this.codeReader.decode(this.canvas);
          }
          // Method 3: Try decodeFromImageData (newer versions)
          else if (this.codeReader && this.codeReader.decodeFromImageData) {
            const imageData = this.context.getImageData(0, 0, width, height);
            result = await this.codeReader.decodeFromImageData(imageData);
          }
          // Method 4: Try decodeBitmap (if that's what we have)
          else if (this.codeReader && this.codeReader.decodeBitmap) {
            const imageData = this.context.getImageData(0, 0, width, height);
            result = await this.codeReader.decodeBitmap(imageData);
          }
          // Method 5: Try decodeFromVideoDevice (for live video)
          else if (this.codeReader && this.codeReader.decodeFromVideoDevice) {
            result = await this.codeReader.decodeFromVideoDevice(undefined, this.video);
          } else {
            if (scanAttempts === 1) {
              this.plugin.logger.error('No suitable decode method found on codeReader');
            }
            return;
          }
        } catch (decodeError: unknown) {
          const error = decodeError as { name?: string; message?: string };
          if (error.name !== 'NotFoundException') {
            if (scanAttempts % 50 === 0) {
              this.plugin.logger.debug('Decode method error', {
                name: error.name,
                message: error.message,
              });
            }
          }
          return;
        }

        if (result) {
          this.plugin.logger.debug('Barcode detected', {
            code: result.getText ? result.getText() : result.text,
            format: result.getBarcodeFormat ? result.getBarcodeFormat() : result.format,
          });

          const barcodeResult: BarcodeResult = {
            code: result.getText ? result.getText() : result.text || result.code || String(result),
            format: result.getBarcodeFormat
              ? result.getBarcodeFormat().toString()
              : result.format || 'Unknown',
          };

          this.stopScanning();
          this.onBarcodeDetected(barcodeResult);
        }

        // Debug: Check if we're getting valid image data
        if (scanAttempts % 30 === 0) {
          const imageData = this.context.getImageData(0, 0, width, height);
          const avgBrightness = this.calculateAverageBrightness(imageData);
          this.plugin.logger.debug('Image data check', {
            width: imageData.width,
            height: imageData.height,
            avgBrightness: avgBrightness.toFixed(1),
          });
        }
      } catch (error: unknown) {
        const err = error as { name?: string; message?: string };
        if (err.name !== 'NotFoundException') {
          if (scanAttempts % 50 === 0) {
            this.plugin.logger.debug('Scan frame error', {
              name: err.name,
              message: err.message,
            });
          }
        }
        // NotFoundException is normal when no barcode is detected
      }
    }, 300);
  }

  private calculateAverageBrightness(imageData: ImageData): number {
    const data = imageData.data;
    let totalBrightness = 0;
    const pixelCount = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      totalBrightness += brightness;
    }

    return totalBrightness / pixelCount;
  }

  stopScanning(): void {
    this.scanning = false;

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }

  async scanImageFile(file: File): Promise<BarcodeResult | null> {
    try {
      this.plugin.logger.debug('Starting image scan', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });

      if (!file.type.startsWith('image/')) {
        throw new Error('Please select a valid image file (JPG, PNG, etc.)');
      }

      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Image file is too large. Please use an image smaller than 10MB.');
      }

      await this.initializeDecoder();

      return new Promise((resolve, reject) => {
        const img = new Image();
        const imageUrl = URL.createObjectURL(file);

        const timeoutId = setTimeout(() => {
          URL.revokeObjectURL(imageUrl);
          reject(new Error('Image loading timed out'));
        }, 15000);

        img.onload = async () => {
          clearTimeout(timeoutId);
          URL.revokeObjectURL(imageUrl);

          try {
            this.plugin.logger.debug('Image loaded successfully', {
              width: img.width,
              height: img.height,
            });
            const result = await this.scanImageWithOptimizedMethods(img);
            resolve(result);
          } catch (error) {
            this.plugin.logger.error('Error during image scanning:', error);
            reject(error);
          }
        };

        img.onerror = () => {
          clearTimeout(timeoutId);
          URL.revokeObjectURL(imageUrl);
          reject(new Error('Failed to load image file. Please try a different image format.'));
        };

        img.crossOrigin = 'anonymous';
        img.src = imageUrl;
      });
    } catch (error) {
      this.plugin.logger.error('Image scan setup error:', error);
      throw error;
    }
  }

  private async scanImageWithOptimizedMethods(
    img: HTMLImageElement
  ): Promise<BarcodeResult | null> {
    // Optimized scanning methods
    const methods = [
      // Method 1: Direct image scan (fastest)
      { name: 'Direct image scan', process: () => this.tryDirectImageScan(img) },

      // Method 2: Canvas 1:1 (most accurate for normal images)
      { name: 'Canvas 1:1', process: () => this.tryOptimizedCanvasScan(img, 1, false) },

      // Method 3: Canvas 2x scale (for small barcodes)
      { name: 'Canvas 2x scale', process: () => this.tryOptimizedCanvasScan(img, 2, false) },

      // Method 4: Canvas 0.5x scale (for large images)
      { name: 'Canvas 0.5x scale', process: () => this.tryOptimizedCanvasScan(img, 0.5, false) },

      // Method 5: High contrast processing
      {
        name: 'High contrast',
        process: () => this.tryOptimizedCanvasScan(img, 1, true, { contrast: 2.0 }),
      },

      // Method 6: Brightness adjustment
      {
        name: 'Brightness boost',
        process: () => this.tryOptimizedCanvasScan(img, 1, true, { brightness: 1.3 }),
      },

      // Method 7: Threshold processing
      {
        name: 'Binary threshold',
        process: () => this.tryOptimizedCanvasScan(img, 1, true, { threshold: 128 }),
      },
    ];

    for (const method of methods) {
      try {
        this.plugin.logger.debug('Trying method', { method: method.name });
        const result = await method.process();

        if (result) {
          this.plugin.logger.debug('Barcode found', {
            method: method.name,
            code: result.code,
          });
          return result;
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.plugin.logger.debug('Method failed', {
          method: method.name,
          error: errorMessage,
        });
      }
    }

    this.plugin.logger.debug('No barcode found after trying all optimized methods');
    return null;
  }

  private async tryDirectImageScan(img: HTMLImageElement): Promise<BarcodeResult | null> {
    try {
      let result: ZXingResult | null = null;

      // Try different ZXing methods for direct image scanning
      if (this.codeReader && this.codeReader.decodeFromImageElement) {
        result = await this.codeReader.decodeFromImageElement(img);
      } else if (this.codeReader && this.codeReader.decodeFromImage) {
        result = await this.codeReader.decodeFromImage(img);
      } else if (this.codeReader && this.codeReader.decode) {
        result = await this.codeReader.decode(img);
      }

      if (result) {
        return {
          code: result.getText(),
          format: result.getBarcodeFormat().toString(),
        };
      }
    } catch (error) {
      // Direct method failed, this is normal
    }
    return null;
  }

  private async tryOptimizedCanvasScan(
    img: HTMLImageElement,
    scale = 1,
    useProcessing = false,
    options: {
      contrast?: number;
      brightness?: number;
      threshold?: number;
    } = {}
  ): Promise<BarcodeResult | null> {
    // Create optimized canvas with willReadFrequently flag to suppress warnings
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', {
      willReadFrequently: true, // This fixes the Canvas2D warnings
    });

    if (!ctx) {
      throw new Error('Could not create canvas context');
    }

    const width = Math.floor(img.width * scale);
    const height = Math.floor(img.height * scale);

    canvas.width = width;
    canvas.height = height;

    // Configure canvas for optimal barcode scanning
    ctx.imageSmoothingEnabled = scale !== 1;
    ctx.imageSmoothingQuality = 'high';

    // Draw image to canvas
    ctx.drawImage(img, 0, 0, width, height);

    // Apply image processing if requested
    if (useProcessing) {
      this.applyOptimizedImageProcessing(ctx, width, height, options);
    }

    try {
      let result: ZXingResult | null = null;

      // Try different ZXing decode methods
      if (this.codeReader && this.codeReader.decodeFromCanvas) {
        result = await this.codeReader.decodeFromCanvas(canvas);
      } else if (this.codeReader && this.codeReader.decode) {
        result = await this.codeReader.decode(canvas);
      } else if (this.codeReader && this.codeReader.decodeFromImageData) {
        const imageData = ctx.getImageData(0, 0, width, height);
        result = await this.codeReader.decodeFromImageData(imageData);
      }

      if (result) {
        return {
          code: result.getText(),
          format: result.getBarcodeFormat().toString(),
        };
      }
    } catch (error) {
      // This method didn't work
    }

    return null;
  }

  private applyOptimizedImageProcessing(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    options: {
      contrast?: number;
      brightness?: number;
      threshold?: number;
    }
  ): void {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Apply brightness
      if (options.brightness && options.brightness !== 1) {
        r = Math.min(255, r * options.brightness);
        g = Math.min(255, g * options.brightness);
        b = Math.min(255, b * options.brightness);
      }

      // Apply contrast
      if (options.contrast && options.contrast !== 1) {
        r = Math.min(255, Math.max(0, (r - 128) * options.contrast + 128));
        g = Math.min(255, Math.max(0, (g - 128) * options.contrast + 128));
        b = Math.min(255, Math.max(0, (b - 128) * options.contrast + 128));
      }

      // Apply threshold (convert to binary)
      if (options.threshold !== undefined) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const thresholded = gray > options.threshold ? 255 : 0;
        r = g = b = thresholded;
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      // Alpha channel stays the same
    }

    ctx.putImageData(imageData, 0, 0);
  }

  onunload(): void {
    this.stopScanning();
    super.onunload();
  }
}

export class BarcodeScannerModal extends Modal {
  private component: Component;
  private scanner: BarcodeScanner;
  private videoContainer: HTMLElement;
  private controlsContainer: HTMLElement;
  private statusElement: HTMLElement;
  private isScanning = false;
  private cameraButton: HTMLButtonElement;
  private uploadButton: HTMLButtonElement;
  private uploadInput: HTMLInputElement;

  constructor(
    app: App,
    private plugin: MacrosPlugin,
    private onBarcodeScanned: (barcode: string) => void
  ) {
    super(app);
    this.component = new Component();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('barcode-scanner-modal');

    contentEl.createEl('h2', {
      text: 'Scan Barcode',
      cls: 'barcode-scanner-header',
    });

    if (MobilePermissionHandler.shouldShowPermissionInstructions()) {
      const instructionsEl = contentEl.createDiv({
        cls: 'permission-instructions',
      });
      instructionsEl.createEl('p', {
        text: '📱 Camera permission may be required.',
        cls: 'mobile-instruction',
      });
      instructionsEl.createEl('small', {
        text: MobilePermissionHandler.getPermissionInstructions(),
        cls: 'permission-help',
      });
    }

    this.statusElement = contentEl.createDiv({
      cls: 'barcode-scanner-status',
      text: 'Choose a scanning method below',
    });

    this.videoContainer = contentEl.createDiv({
      cls: 'barcode-scanner-video-container',
    });

    this.controlsContainer = contentEl.createDiv({
      cls: 'barcode-scanner-controls',
    });

    this.createControlsWithDiagnostics();
    this.initializeScanner();
  }

  private async createControlsWithDiagnostics(): Promise<void> {
    // Run camera diagnostics first
    const diagnostics = await CameraDiagnostics.checkCameraAvailability();

    if (!diagnostics.hasCamera) {
      // Show error message if no camera detected
      const errorDiv = this.controlsContainer.createDiv({
        cls: 'camera-error-message',
      });
      errorDiv.createEl('p', {
        text: '⚠️ No camera detected',
        cls: 'error-title',
      });
      errorDiv.createEl('p', {
        text: diagnostics.error || 'No cameras found on this device',
        cls: 'error-description',
      });
    } else {
      this.plugin.logger.debug('Camera diagnostics', {
        count: diagnostics.cameras.length,
        cameras: diagnostics.cameras,
      });

      // Test basic camera access
      const accessTest = await CameraDiagnostics.testBasicCameraAccess();

      if (!accessTest.success) {
        const warningDiv = this.controlsContainer.createDiv({
          cls: 'camera-warning-message',
        });
        warningDiv.createEl('p', {
          text: '⚠️ Camera access issue detected',
          cls: 'warning-title',
        });
        warningDiv.createEl('p', {
          text: accessTest.error || 'Camera permission or access issue',
          cls: 'warning-description',
        });

        // Add troubleshooting info
        const troubleshootDiv = warningDiv.createDiv({ cls: 'troubleshooting' });
        troubleshootDiv.createEl('p', { text: 'Troubleshooting steps:' });
        const list = troubleshootDiv.createEl('ul');
        list.createEl('li', { text: 'Check Windows Privacy Settings (Camera permissions)' });
        list.createEl('li', { text: 'Restart Obsidian' });
        list.createEl('li', { text: 'Try using "Upload Image" instead' });
        list.createEl('li', { text: 'Check if other apps can access your camera' });
      }
    }

    // Create the camera button
    this.cameraButton = this.controlsContainer.createEl('button', {
      text: diagnostics.hasCamera ? '📷 Start Camera Scan' : '📷 Camera Not Available',
      cls: 'mod-cta barcode-scan-camera-btn',
    }) as HTMLButtonElement;

    // Disable camera button if no camera detected
    if (!diagnostics.hasCamera) {
      this.cameraButton.disabled = true;
      this.cameraButton.title = 'No camera detected on this device';
    }

    this.component.registerDomEvent(this.cameraButton, 'click', async () => {
      if (this.isScanning) {
        this.stopCameraScanning();
      } else {
        await this.startCameraScanning();
      }
    });

    // Create other controls
    this.createOtherControls();
  }

  private createOtherControls(): void {
    this.uploadButton = this.controlsContainer.createEl('button', {
      text: '🖼️ Upload Image',
      cls: 'barcode-scan-upload-btn',
    }) as HTMLButtonElement;

    this.uploadInput = document.createElement('input');
    this.uploadInput.type = 'file';
    this.uploadInput.accept = 'image/*';
    this.uploadInput.capture = 'environment';
    this.uploadInput.style.display = 'none';

    this.component.registerDomEvent(this.uploadButton, 'click', () => {
      this.uploadInput.click();
    });

    this.component.registerDomEvent(this.uploadInput, 'change', async () => {
      const file = this.uploadInput.files?.[0];
      if (file) {
        await this.handleImageUpload(file);
      }
    });

    const manualBtn = this.controlsContainer.createEl('button', {
      text: '✏️ Enter Manually',
      cls: 'barcode-scan-manual-btn',
    });

    this.component.registerDomEvent(manualBtn, 'click', () => {
      this.showManualEntry();
    });

    const closeBtn = this.controlsContainer.createEl('button', {
      text: 'Cancel',
      cls: 'barcode-scan-close-btn',
    });

    this.component.registerDomEvent(closeBtn, 'click', () => {
      this.close();
    });
  }

  private async initializeScanner(): Promise<void> {
    this.scanner = new BarcodeScanner(
      this.app,
      this.plugin,
      (result) => this.handleBarcodeDetected(result),
      (error) => this.handleScanError(error)
    );
  }

  private async startCameraScanning(): Promise<void> {
    if (this.isScanning) return;

    try {
      this.statusElement.textContent = 'Requesting camera access...';
      this.cameraButton.textContent = '⏳ Initializing...';
      this.cameraButton.disabled = true;

      const cameraReady = await this.scanner.initializeCamera();

      if (!cameraReady) {
        this.cameraButton.textContent = '📷 Start Camera Scan';
        this.cameraButton.disabled = false;
        return;
      }

      this.videoContainer.empty();

      const video = this.videoContainer.createEl('video', {
        cls: 'barcode-scanner-video',
        attr: {
          autoplay: 'true',
          muted: 'true',
          playsinline: 'true',
        },
      });

      this.statusElement.textContent = 'Point camera at barcode... Hold steady for best results.';

      await this.scanner.startScanning(video);
      this.isScanning = true;

      this.updateControlButtons(true);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.handleScanError(`Camera scanning failed: ${errorMessage}`);
      this.cameraButton.textContent = '📷 Start Camera Scan';
      this.cameraButton.disabled = false;
    }
  }

  private stopCameraScanning(): void {
    if (!this.isScanning) return;

    this.scanner.stopScanning();
    this.isScanning = false;
    this.videoContainer.empty();
    this.statusElement.textContent = 'Camera scanning stopped. Choose another method or try again.';
    this.updateControlButtons(false);
  }

  private async handleImageUpload(file: File): Promise<void> {
    try {
      this.statusElement.textContent = `Scanning image: ${file.name}...`;
      this.uploadButton.textContent = '⏳ Scanning...';
      this.uploadButton.disabled = true;

      const result = await this.scanner.scanImageFile(file);

      if (result) {
        this.handleBarcodeDetected(result);
      } else {
        this.statusElement.textContent =
          'No barcode found in image. Try a different image or use manual entry.';
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.handleScanError(`Image scan failed: ${errorMessage}`);
    } finally {
      this.uploadButton.textContent = '🖼️ Upload Image';
      this.uploadButton.disabled = false;
      this.uploadInput.value = '';
    }
  }

  private showManualEntry(): void {
    const modal = new ManualBarcodeEntryModal(this.app, (barcode) => {
      this.onBarcodeScanned(barcode);
      this.close();
    });

    modal.open();
    this.close();
  }

  private handleBarcodeDetected(result: BarcodeResult): void {
    this.plugin.logger.debug('Barcode scanned successfully', result);

    const validation = BarcodeUtils.validateBarcode(result.code);
    const displayCode = BarcodeUtils.formatBarcodeForDisplay(result.code);

    let message = `Barcode detected: ${displayCode}`;
    if (validation.format) {
      message += ` (${validation.format})`;
    }

    new Notice(message);

    this.onBarcodeScanned(result.code);
    this.close();
  }

  private handleScanError(error: string): void {
    this.plugin.logger.error('Barcode scan error:', error);
    this.statusElement.textContent = error;
    this.updateControlButtons(false);
  }

  private updateControlButtons(scanning: boolean): void {
    if (scanning) {
      this.cameraButton.textContent = '⏹️ Stop Scanning';
      this.cameraButton.disabled = false;
      this.uploadButton.disabled = true;
    } else {
      this.cameraButton.textContent = '📷 Start Camera Scan';
      this.cameraButton.disabled = false;
      this.uploadButton.disabled = false;
    }
  }

  onClose(): void {
    if (this.scanner) {
      this.scanner.stopScanning();
      this.scanner.unload();
    }
    this.component.unload();
    this.contentEl.empty();
  }
}

class ManualBarcodeEntryModal extends Modal {
  private component: Component;
  private barcodeInput: HTMLInputElement;

  constructor(
    app: App,
    private onBarcodeEntered: (barcode: string) => void
  ) {
    super(app);
    this.component = new Component();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('manual-barcode-entry-modal');

    contentEl.createEl('h2', { text: 'Enter Barcode Manually' });

    contentEl.createEl('p', {
      text: 'Enter the numbers from the barcode (EAN/UPC codes are typically 8-13 digits):',
      cls: 'modal-description',
    });

    const inputContainer = contentEl.createDiv({ cls: 'barcode-input-container' });

    this.barcodeInput = inputContainer.createEl('input', {
      type: 'text',
      placeholder: 'e.g., 1234567890123',
      cls: 'barcode-manual-input',
    });

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    const submitBtn = buttonContainer.createEl('button', {
      text: 'Search',
      cls: 'mod-cta',
    });

    const cancelBtn = buttonContainer.createEl('button', {
      text: 'Cancel',
    });

    this.component.registerDomEvent(submitBtn, 'click', () => this.handleSubmit());
    this.component.registerDomEvent(cancelBtn, 'click', () => this.close());
    this.component.registerDomEvent(this.barcodeInput, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        this.handleSubmit();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });

    setTimeout(() => this.barcodeInput.focus(), 50);
  }

  private handleSubmit(): void {
    const barcode = this.barcodeInput.value.trim();

    if (!barcode) {
      new Notice('Please enter a barcode');
      return;
    }

    const validation = BarcodeUtils.validateBarcode(barcode);

    if (!validation.isValid) {
      new Notice('Please enter a valid barcode (8-14 digits)');
      return;
    }

    if (validation.checksumValid === false) {
      new Notice(`Warning: Barcode has invalid checksum, but searching anyway...`);
    }

    this.onBarcodeEntered(validation.normalizedCode || barcode);
    this.close();
  }

  onClose(): void {
    this.component.unload();
    this.contentEl.empty();
  }
}
