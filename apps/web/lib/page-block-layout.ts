export type PositionedBlock = {
  type: string;
  config: Record<string, unknown>;
};

export function bookingBlockIndex(blocks: PositionedBlock[]) {
  const index = blocks.findIndex((block) => block.type === 'FORM');
  return index === -1 ? blocks.length : index;
}

export function bookingBlockConfig(blocks: PositionedBlock[]) {
  const block = blocks[bookingBlockIndex(blocks)];
  if (!block || block.type !== 'FORM') return {};
  return {
    heading:
      typeof block.config.heading === 'string' ? block.config.heading : '',
    submitLabel:
      typeof block.config.submitLabel === 'string'
        ? block.config.submitLabel
        : '',
  };
}
