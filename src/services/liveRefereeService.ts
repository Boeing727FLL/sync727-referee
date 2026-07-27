import {
  GoogleGenAI,
  LiveServerMessage,
  MediaResolution,
  Modality,
  Session,
} from '@google/genai';
import { writeFile } from 'fs';
import { IncomingMessage } from 'http';

export interface LiveInterfaceCallbacks {
  onOpen?: () => void;
  onMessage?: (message: LiveServerMessage) => void;
  onError?: (error: ErrorEvent) => void;
  onClose?: (event: CloseEvent) => void;
}

export class LiveRefereeInterface {
  private ai: GoogleGenAI;
  private session: Session | undefined = undefined;
  private responseQueue: LiveServerMessage[] = [];
  private audioParts: string[] = [];
  private isConnected = false;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async connect(callbacks?: LiveInterfaceCallbacks): Promise<void> {
    const config = {
      responseModalities: [Modality.TEXT, Modality.AUDIO],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Charon',
          }
        }
      },
      tools: [
        { googleSearch: {} },
      ],
      contextWindowCompression: {
        triggerTokens: '104857',
        slidingWindow: { targetTokens: '52428' },
      },
    };

    this.session = await this.ai.live.connect({
      model: 'models/gemini-1.5-flash-latest',
      callbacks: {
        onopen: () => {
          console.log('Live connection opened');
          callbacks?.onOpen?.();
          this.isConnected = true;
        },
        onmessage: (message: LiveServerMessage) => {
          console.log('Live message received:', message);
          callbacks?.onMessage?.(message);
          this.responseQueue.push(message);
        },
        onerror: (e: ErrorEvent) => {
          console.error('Live connection error:', e.message);
          callbacks?.onError?.(e);
          this.isConnected = false;
        },
        onclose: (e: CloseEvent) => {
          console.log('Live connection closed:', e.reason);
          callbacks?.onClose?.(e);
          this.isConnected = false;
        },
      },
      config,
    });
  }

  async sendClientContent(content: string, imageData?: string): Promise<void> {
    if (!this.session) {
      throw new Error('Session not connected');
    }

    const turn: any = { turns: [{ parts: [{ text: content }] }] };
    
    if (imageData) {
      // Add image to the message
      turn.turns[0].parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageData,
        },
      });
    }

    this.session.sendClientContent(turn);
  }

  async waitForTurn(): Promise<LiveServerMessage[]> {
    let done = false;
    const turn: LiveServerMessage[] = [];
    
    while (!done) {
      const message = this.responseQueue.shift();
      if (message) {
        turn.push(message);
        if (message.serverContent?.turnComplete) {
          done = true;
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return turn;
  }

  isSessionConnected(): boolean {
    return this.isConnected && !!this.session;
  }

  close(): void {
    if (this.session) {
      this.session.close();
      this.session = undefined;
      this.isConnected = false;
    }
  }
}
