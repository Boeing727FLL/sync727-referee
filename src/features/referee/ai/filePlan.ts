export type RequestFileDescriptor = {
  fileName: string;
  isPdf: boolean;
  isText: boolean;
  isUserPhoto: boolean;
  isR2Rulebook: boolean;
};

export function describeRequestFile(file: { key: string; url: string; isRulebook: boolean; actualFile?: File }): RequestFileDescriptor {
  const rawName = file.actualFile?.name || file.key || 'file';
  const fileName = rawName.split('/').pop() || rawName;
  return {
    fileName,
    isPdf: file.actualFile?.type === 'application/pdf' || /\.pdf$/i.test(fileName) || file.url?.toLowerCase().endsWith('.pdf'),
    isText: Boolean(file.actualFile?.type?.startsWith('text/') || /\.(txt|json|xml)$/i.test(fileName)),
    isUserPhoto: !file.isRulebook,
    isR2Rulebook: !file.actualFile && file.url.includes('fll-rules'),
  };
}

export function imageLabel(index: number, fileName: string, isUserPhoto: boolean, pageIndex?: number): string {
  if (isUserPhoto) return `Image ${index}:\n--- USER PHOTO (Analyze this to see what the user is asking about) | FILE: ${fileName} ---\n`;
  if (/update/i.test(fileName)) return `Image ${index}:\n--- UPDATES PAGE (Official updates document - overrides the base rulebook) | FILE: ${fileName}${pageIndex ? ` | PAGE: ${pageIndex}` : ''} ---\n`;
  return `Image ${index}:\n--- RULEBOOK PAGE (Use this as reference only) | FILE: ${fileName}${pageIndex ? ` | PAGE: ${pageIndex}` : ''} ---\n`;
}
