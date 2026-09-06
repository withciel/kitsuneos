import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { requireWorkspace } from '@/lib/require-workspace';

/** Download attachment bytes (grant-gated via engine.getAttachment). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  try {
    const ctx = await requireWorkspace();
    const { attachmentId } = await context.params;
    const result = await engine.getAttachment(
      ctx.workspaceId,
      ctx.principalId,
      attachmentId,
    );
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const bytes = Buffer.from(result.contentBase64, 'base64');
    const headers = new Headers({
      'Content-Type': result.meta.contentType || 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store',
    });
    if (result.meta.fileName) {
      headers.set(
        'Content-Disposition',
        `attachment; filename="${result.meta.fileName.replace(/"/g, '')}"`,
      );
    }
    return new NextResponse(bytes, { status: 200, headers });
  } catch (error) {
    return jsonError(error);
  }
}
