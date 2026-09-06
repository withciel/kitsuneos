import { KitsuneError } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { requireWorkspace } from '@/lib/require-workspace';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** List attachments for a record (grant-filtered by engine). */
export async function GET(request: Request) {
  try {
    const ctx = await requireWorkspace();
    const url = new URL(request.url);
    const collection = url.searchParams.get('collection')?.trim() ?? '';
    const recordId = url.searchParams.get('recordId')?.trim() ?? '';
    const fieldName = url.searchParams.get('fieldName')?.trim() || undefined;
    if (!collection || !recordId) {
      throw new KitsuneError(
        'collection and recordId are required',
        'validation',
      );
    }
    const attachments = await engine.listAttachments(
      ctx.workspaceId,
      ctx.principalId,
      { collection, recordId, fieldName },
    );
    return NextResponse.json({ attachments });
  } catch (error) {
    return jsonError(error);
  }
}

/** Upload attachment JSON (base64) matching engine putAttachment. */
export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    const body = (await request.json()) as {
      collection?: string;
      recordId?: string;
      fieldName?: string;
      contentType?: string;
      contentBase64?: string;
      fileName?: string;
    };
    const collection = body.collection?.trim() ?? '';
    const recordId = body.recordId?.trim() ?? '';
    const fieldName = body.fieldName?.trim() ?? '';
    const contentBase64 = body.contentBase64 ?? '';
    if (!collection || !recordId || !fieldName || !contentBase64) {
      throw new KitsuneError(
        'collection, recordId, fieldName, and contentBase64 are required',
        'validation',
      );
    }

    let byteLength = 0;
    try {
      byteLength = Buffer.from(contentBase64, 'base64').byteLength;
    } catch {
      throw new KitsuneError('contentBase64 is invalid', 'validation');
    }
    if (byteLength > MAX_UPLOAD_BYTES) {
      throw new KitsuneError(
        `Attachment exceeds ${MAX_UPLOAD_BYTES} byte limit`,
        'validation',
      );
    }

    const attachment = await engine.putAttachment(
      ctx.workspaceId,
      ctx.principalId,
      {
        collection,
        recordId,
        fieldName,
        contentType: body.contentType?.trim() || 'application/octet-stream',
        contentBase64,
        fileName: body.fileName?.trim() || undefined,
      },
    );
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
