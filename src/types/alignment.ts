

// Interface representing the structure of a JSONL record for fine-tuning
export interface JsonlRecord {
  messages: [
    { role: 'system'; content: string },
    { role: 'user'; content: string },
    { role: 'assistant'; content: string }
  ];
}
