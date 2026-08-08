import { auth, googleProvider } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

let cachedGmailAccessToken: string | null = null;

export function setGmailAccessToken(token: string | null) {
  cachedGmailAccessToken = token;
}

export function getGmailAccessToken(): string | null {
  return cachedGmailAccessToken;
}

/**
 * Ensures a valid Google Access Token with Gmail scopes is available.
 * If not cached or explicitly requested, triggers signInWithPopup.
 */
export async function acquireGmailAccessToken(forcePrompt = false): Promise<string> {
  if (cachedGmailAccessToken && !forcePrompt) {
    return cachedGmailAccessToken;
  }

  try {
    // Add Gmail scopes
    googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
    googleProvider.addScope('https://www.googleapis.com/auth/gmail.compose');

    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (!token) {
      throw new Error('Google OAuth sign-in did not return an access token for Gmail. Please try signing in again.');
    }

    cachedGmailAccessToken = token;
    return token;
  } catch (err: any) {
    console.error("Failed to acquire Gmail token via OAuth popup:", err);
    if (err?.code === 'auth/popup-blocked' || err?.message?.includes('popup')) {
      throw new Error('Google OAuth popup was blocked. If you are in an iframe preview, please open the app in a new browser tab to send emails via Gmail.');
    }
    throw err;
  }
}

/**
 * Converts a string or ArrayBuffer into base64url encoding.
 */
function base64UrlEncode(buffer: ArrayBuffer | string): string {
  let base64 = '';
  if (typeof buffer === 'string') {
    base64 = btoa(unescape(encodeURIComponent(buffer)));
  } else {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  }

  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface SendEmailParams {
  to: string;
  subject: string;
  bodyText: string;
  pdfBlob?: Blob;
  pdfFilename?: string;
  accessToken?: string;
}

/**
 * Sends an email using Gmail API (with optional PDF attachment).
 */
export async function sendEmailWithPdfAttachment(params: SendEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!params.to || !params.to.trim()) {
    return { success: false, error: "Recipient email address is empty." };
  }

  try {
    let token = params.accessToken || cachedGmailAccessToken;
    if (!token) {
      try {
        token = await acquireGmailAccessToken();
      } catch (authErr: any) {
        return {
          success: false,
          error: authErr?.message || "Gmail authorization required. Click 'Send Invoice PDF via Gmail' to authorize."
        };
      }
    }

    let rawMimeString = '';
    const boundary = `====_CrestFlow_Boundary_${Date.now()}_${Math.random().toString(36).substring(2)}====`;

    if (params.pdfBlob && params.pdfFilename) {
      const pdfArrayBuffer = await params.pdfBlob.arrayBuffer();
      const bytes = new Uint8Array(pdfArrayBuffer);
      let binary = '';
      const len = bytes.byteLength;
      const chunkSize = 0x8000;
      for (let i = 0; i < len; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunkSize, len))));
      }
      const rawBase64 = btoa(binary);
      // MIME standard requires wrapping base64 data at 76 characters per line
      const standardPdfBase64 = rawBase64.match(/.{1,76}/g)?.join('\r\n') || rawBase64;

      const mimeMessageParts = [
        `To: ${params.to.trim()}`,
        `Subject: ${params.subject.trim()}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        params.bodyText,
        ``,
        `--${boundary}`,
        `Content-Type: application/pdf; name="${params.pdfFilename}"`,
        `Content-Disposition: attachment; filename="${params.pdfFilename}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        standardPdfBase64,
        ``,
        `--${boundary}--`
      ];

      rawMimeString = mimeMessageParts.join('\r\n');
    } else {
      const mimeMessageParts = [
        `To: ${params.to.trim()}`,
        `Subject: ${params.subject.trim()}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset="UTF-8"`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        params.bodyText
      ];
      rawMimeString = mimeMessageParts.join('\r\n');
    }

    const rawBase64Url = base64UrlEncode(rawMimeString);

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: rawBase64Url
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      if ((response.status === 401 || response.status === 403) && !params.accessToken) {
        console.warn("Gmail token expired/invalid. Re-authenticating via OAuth popup...");
        const newToken = await acquireGmailAccessToken(true);
        return sendEmailWithPdfAttachment({ ...params, accessToken: newToken });
      }
      throw new Error(errData?.error?.message || `Gmail API error (${response.status})`);
    }

    const resJson = await response.json();
    return { success: true, id: resJson.id };
  } catch (error: any) {
    console.error("Gmail send error:", error);
    return { success: false, error: error?.message || String(error) };
  }
}
