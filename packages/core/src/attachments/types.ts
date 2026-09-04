export interface AttachmentMeta {
  id: string;
  collection: string;
  recordId: string;
  fieldName: string;
  contentHash: string;
  contentType: string;
  byteSize: number;
  fileName: string | null;
  createdAt: string;
}

export interface PutAttachmentInput {
  collection: string;
  recordId: string;
  fieldName: string;
  contentType: string;
  /** Raw bytes as base64 for MCP / JSON transport. */
  contentBase64: string;
  fileName?: string;
}
