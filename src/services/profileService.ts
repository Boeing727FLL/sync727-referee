export interface WebClipConfig {
  label: string;
  url: string;
  isRemovable: boolean;
  iconBase64?: string;
}

export interface WiFiConfig {
  ssid: string;
  password?: string;
  encryptionType: 'WPA' | 'WEP' | 'None';
  isHidden: boolean;
}

export interface ProfileMetadata {
  name: string;
  organization: string;
  identifier: string;
  description: string;
}

export function generateMobileConfig(
  metadata: ProfileMetadata,
  webClips: WebClipConfig[] = [],
  wifiConfigs: WiFiConfig[] = []
): string {
  const uuid1 = crypto.randomUUID();
  const uuid2 = crypto.randomUUID();

  let payloads = '';

  // Web Clip Payload
  webClips.forEach((clip, index) => {
    const clipUuid = crypto.randomUUID();
    payloads += `
    <dict>
      <key>PayloadDisplayName</key>
      <string>Web Clip (${clip.label})</string>
      <key>PayloadIdentifier</key>
      <string>${metadata.identifier}.webclip.${index}</string>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key>
      <string>${clipUuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Label</key>
      <string>${clip.label}</string>
      <key>URL</key>
      <string>${clip.url}</string>
      <key>IsRemovable</key>
      <${clip.isRemovable ? 'true' : 'false'}/>
      ${clip.iconBase64 ? `<key>Icon</key><data>${clip.iconBase64}</data>` : ''}
    </dict>`;
  });

  // WiFi Payload
  wifiConfigs.forEach((wifi, index) => {
    const wifiUuid = crypto.randomUUID();
    payloads += `
    <dict>
      <key>PayloadDisplayName</key>
      <string>Wi-Fi (${wifi.ssid})</string>
      <key>PayloadIdentifier</key>
      <string>${metadata.identifier}.wifi.${index}</string>
      <key>PayloadType</key>
      <string>com.apple.wifi.managed</string>
      <key>PayloadUUID</key>
      <string>${wifiUuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>SSID_STR</key>
      <string>${wifi.ssid}</string>
      <key>HIDDEN_NETWORK</key>
      <${wifi.isHidden ? 'true' : 'false'}/>
      <key>EncryptionType</key>
      <string>${wifi.encryptionType}</string>
      ${wifi.password ? `<key>Password</key><string>${wifi.password}</string>` : ''}
    </dict>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    ${payloads}
  </array>
  <key>PayloadDisplayName</key>
  <string>${metadata.name}</string>
  <key>PayloadIdentifier</key>
  <string>${metadata.identifier}</string>
  <key>PayloadOrganization</key>
  <string>${metadata.organization}</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${uuid1}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
  <key>PayloadDescription</key>
  <string>${metadata.description}</string>
</dict>
</plist>`;
}
