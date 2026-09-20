/** Remove private model-reasoning blocks before display, logs or team history. */
export const stripThinkBlocks = (text: string): string =>
  (text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '').trim();
