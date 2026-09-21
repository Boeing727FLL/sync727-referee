type CorrectionLine = { line: string; index: number };
export function parseCorrections(text: string): string[] { return text ? text.split('\n') : []; }
export function serializeCorrections(lines: string[]): string { return lines.join('\n'); }
export function correctionCount(lines: string[]): number { return lines.filter(line => line.trim()).length; }
export function visibleCorrections(lines: string[], search: string): CorrectionLine[] { const query=search.trim().toLowerCase(); const all=lines.map((line,index)=>({line,index})); return query ? all.filter(item=>item.line.toLowerCase().includes(query)) : all; }
export function addCorrection(lines: string[], draft: string): string[] { const value=draft.trim(); return value ? [...lines,value] : lines; }
export function editCorrection(lines: string[], index: number, value: string): string[] { return lines.map((line,position)=>position===index?value:line); }
export function deleteCorrection(lines: string[], index: number): string[] { return lines.filter((_,position)=>position!==index); }
